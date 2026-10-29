import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path when imported as backend.main
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Explicitly load backend/.env at startup
try:
    import dotenv
    env_file = backend_dir / ".env"
    if env_file.exists():
        dotenv.load_dotenv(env_file, override=True)
except Exception:
    pass

from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from database import engine, Base, SessionLocal
import models
from security import hash_password
from routes import auth, users, messages, groups, files, admin, smart, conversations, contact, privacy, spreadsheets
from websocket.chat import handle_websocket_connection
from services.smart_service import smart_service

is_serverless = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

def check_and_migrate_db():
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        table_names = inspector.get_table_names()
        with engine.begin() as conn:
            if "users" in table_names:
                u_cols = [col["name"] for col in inspector.get_columns("users")]
                if "auto_translate" not in u_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN auto_translate BOOLEAN DEFAULT TRUE"))
                if "default_view_translation" not in u_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN default_view_translation BOOLEAN DEFAULT TRUE"))
                if "oauth_provider" not in u_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50) NULL"))
                if "oauth_id" not in u_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN oauth_id VARCHAR(100) NULL"))
            if "messages" in table_names:
                columns = [col["name"] for col in inspector.get_columns("messages")]
                if "message_type" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'"))
                if "file_id" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN file_id INTEGER NULL"))
                if "updated_at" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN updated_at TIMESTAMP NULL"))
        # Re-ensure all tables exist
        models.Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Migration note: {e}")

try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Table creation note: {e}")

try:
    check_and_migrate_db()
except Exception as e:
    print(f"Migration init note: {e}")


# Ensure default administrator exists if database is newly initialized
def seed_demo_users():
    """Ensures default admin exists. Demo accounts have been completely removed."""
    db = SessionLocal()
    try:
        # Ensure default administrator exists with requested credentials
        admin_user = db.query(models.User).filter(
            (models.User.email == "frankline30999112@gmail.com") |
            (models.User.username == "frankline30999112@gmail.com") |
            (models.User.username == "frankline") |
            (models.User.username == "admin") |
            (models.User.role == "admin")
        ).first()
        if not admin_user:
            admin_user = models.User(
                username="frankline30999112@gmail.com",
                email="frankline30999112@gmail.com",
                frank_id="ADM001",
                full_name="Frankline",
                bio="System Administrator",
                hashed_password=hash_password("#Frankline2006"),
                role="admin",
                account_status="active",
                is_online=False
            )
            db.add(admin_user)
            db.commit()
    except Exception as e:
        print(f"Admin init note: {e}")
    finally:
        db.close()

seed_demo_users()

def seed_spreadsheets():
    """Safely imports pre-existing spreadsheets from EXCELL project for default admin user."""
    db = SessionLocal()
    try:
        if db.query(models.Spreadsheet).count() == 0:
            admin_user = db.query(models.User).filter(
                (models.User.email == "frankline30999112@gmail.com") |
                (models.User.role == "admin")
            ).first()
            if admin_user:
                import sqlite3
                src_sqlite = Path(r"C:\Users\inbat\OneDrive\Documents\EXCELL project\data\spreadsheets.sqlite")
                if src_sqlite.exists():
                    conn = sqlite3.connect(str(src_sqlite))
                    cursor = conn.cursor()
                    cursor.execute("SELECT id, title, active_sheet_id, data, created_at, updated_at FROM spreadsheets")
                    for row in cursor.fetchall():
                        r_id, r_title, r_active, r_data, r_created, r_updated = row
                        now_dt = models.get_utc_now()
                        sheet = models.Spreadsheet(
                            id=r_id,
                            user_id=admin_user.id,
                            title=r_title,
                            active_sheet_id=r_active,
                            data=r_data,
                            created_at=now_dt,
                            updated_at=now_dt
                        )
                        db.add(sheet)
                    db.commit()
                    conn.close()
    except Exception as e:
        print(f"Spreadsheet seed note: {e}")
    finally:
        db.close()

seed_spreadsheets()


# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        path = request.url.path
        if "/files/" in path and ("/view" in path or "/download" in path):
            if "X-Frame-Options" in response.headers:
                del response.headers["X-Frame-Options"]
            response.headers["Content-Security-Policy"] = "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* https://*.vercel.app *"
        else:
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
        # Prevent search engine crawlers from indexing private paths, APIs, uploads, or accounts
        if (
            path.startswith("/api/")
            or path.startswith("/uploads/")
            or "/files/" in path
            or path.startswith("/dashboard")
            or path.startswith("/settings")
            or path.startswith("/profile")
            or path.startswith("/admin")
            or path.startswith("/privacy-dashboard")
        ):
            response.headers["X-Robots-Tag"] = "noindex, nofollow"

        return response


app = FastAPI(
    title="FRANK API",
    description="FRANK real-time communication platform API",
    version="2.0.0"
)

from sqlalchemy.exc import SQLAlchemyError

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    import logging
    logging.error(f"[DB ERROR] {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=503,
        content={"detail": "Database service is temporarily unavailable. Please try again shortly."}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.error(f"[SERVER ERROR] {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again in a moment."}
    )


# CORS configuration
default_origins = [
    "https://fnk.vercel.app",
    "https://fnk.vercel.app/",
    "https://frank-chat-app.vercel.app",
    "https://frank-chat-vercel.app",
    "https://frank-chat-vercel.vercel.app",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    "null"
]

env_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
frontend_url = os.getenv("FRONTEND_URL", "").strip()
if frontend_url and frontend_url not in default_origins:
    default_origins.append(frontend_url)

allowed_origins = list(set(default_origins + env_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in env_origins else ["https://frank-chat-app.vercel.app"],
    allow_origin_regex=r"^https:\/\/([a-zA-Z0-9_-]+\.)?vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(SecurityHeadersMiddleware)

# Handle both /api/... and stripped paths in case of serverless path rewriting
@app.middleware("http")
async def ensure_api_prefix(request: Request, call_next):
    path = request.url.path
    # Never rewrite static frontend assets or HTML pages
    if not any(path.endswith(ext) for ext in [".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".txt", ".xml"]):
        for pfx in ["/auth", "/users", "/messages", "/groups", "/files", "/health", "/admin", "/conversations", "/smart", "/contact", "/privacy", "/spreadsheets"]:
            if (path == pfx and pfx not in ["/admin", "/privacy"]) or path.startswith(pfx + "/"):
                request.scope["path"] = "/api" + path
                break
    response = await call_next(request)
    return response

# Include Routers with both /api prefix and root prefix
for r in [auth.router, users.router, messages.router, groups.router, files.router, admin.router, smart.router, conversations.router, contact.router, privacy.router, spreadsheets.router]:
    app.include_router(r, prefix="/api")
    app.include_router(r)


# WebSocket Gateway
@app.websocket("/ws/{token}")
@app.websocket("/api/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    await handle_websocket_connection(websocket, token)


@app.api_route("/health", methods=["GET", "HEAD"])
@app.api_route("/api/health", methods=["GET", "HEAD"])
def health_check():
    """
    Lightweight, read-only health endpoint for UptimeRobot and uptime monitoring.
    Verifies backend runtime and database connectivity via a read-only ping.
    Returns:
        { "status": "ok", "database": "connected" }
    Guarantees:
        - 100% read-only: never modifies, resets, deletes, or recreates data.
    """
    db_connected = False
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        db_connected = False

    status_code = 200 if db_connected else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if db_connected else "error",
            "database": "connected" if db_connected else "disconnected"
        }
    )


@app.get("/ai/status")
@app.get("/api/ai/status")
async def ai_status_endpoint():
    """AI connectivity status for Smart Conversations."""
    return await smart_service.test_ai_connectivity()



@app.get("/api")
@app.get("/api/")
@app.get("/api/index.py")
def api_root():
    return {
        "service": "FRANK Backend",
        "status": "ok",
        "version": "2.0.0"
    }


# Frontend Static Files Serving
backend_frontend = Path(__file__).resolve().parent / "frontend"
root_frontend = Path(__file__).resolve().parent.parent / "frontend"
root_dir = Path(__file__).resolve().parent.parent

if backend_frontend.exists():
    frontend_dir = backend_frontend
elif root_frontend.exists():
    frontend_dir = root_frontend
elif (root_dir / "index.html").exists():
    frontend_dir = root_dir
else:
    frontend_dir = None

# Mount persistent /uploads folder for avatars and files
if is_serverless or os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    uploads_storage_dir = Path("/tmp") / "uploads"
else:
    uploads_storage_dir = Path(__file__).resolve().parent / "uploads"

try:
    uploads_storage_dir.mkdir(parents=True, exist_ok=True)
    (uploads_storage_dir / "avatars").mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_storage_dir)), name="uploads")
except Exception as e:
    print(f"Uploads mount note: {e}")

if frontend_dir and frontend_dir.exists():
    if (frontend_dir / "css").exists():
        app.mount("/css", StaticFiles(directory=str(frontend_dir / "css")), name="css")
    if (frontend_dir / "js").exists():
        app.mount("/js", StaticFiles(directory=str(frontend_dir / "js")), name="js")
    if (frontend_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_dir / "assets")), name="assets")
    if (frontend_dir / "i18n").exists():
        app.mount("/i18n", StaticFiles(directory=str(frontend_dir / "i18n")), name="i18n")
    if (frontend_dir / "vendor").exists():
        app.mount("/vendor", StaticFiles(directory=str(frontend_dir / "vendor")), name="vendor")
    elif (root_dir / "vendor").exists():
        app.mount("/vendor", StaticFiles(directory=str(root_dir / "vendor")), name="vendor")

    @app.get("/download")
    @app.get("/downloads")
    @app.get("/downloads/")
    @app.get("/downloads/index")
    @app.get("/downloads/index.html")
    @app.head("/downloads/index.html")
    def serve_downloads_page():
        target = root_dir / "downloads" / "index.html"
        if not target.exists() and frontend_dir:
            target = frontend_dir / "downloads" / "index.html"
        if target.exists():
            return FileResponse(target, media_type="text/html; charset=utf-8")
        return JSONResponse(status_code=404, content={"detail": "Download page not found"})

    @app.get("/downloads/{filename}")
    @app.head("/downloads/{filename}")
    def serve_downloads(filename: str):
        if filename in ["index.html", "index"]:
            return serve_downloads_page()
        target = root_dir / "downloads" / filename
        if not target.exists() and frontend_dir:
            target = frontend_dir / "downloads" / filename
        if target.exists():
            if filename.endswith(".apk"):
                return FileResponse(
                    target,
                    media_type="application/vnd.android.package-archive",
                    filename=filename,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'}
                )
            return FileResponse(target)
        return JSONResponse(status_code=404, content={"detail": "File not found"})

    @app.get("/")
    @app.get("/index")
    @app.get("/home")
    def serve_landing(request: Request):
        return FileResponse(frontend_dir / "index.html")

    @app.get("/login")
    def serve_login():
        return FileResponse(frontend_dir / "login.html")

    @app.get("/register")
    def serve_register():
        return FileResponse(frontend_dir / "register.html")

    @app.get("/dashboard")
    def serve_dashboard():
        return FileResponse(frontend_dir / "dashboard.html")

    @app.get("/chat")
    def serve_chat():
        return FileResponse(frontend_dir / "dashboard.html")

    @app.get("/settings")
    def serve_settings():
        return FileResponse(frontend_dir / "settings.html")

    @app.get("/profile")
    def serve_profile():
        return FileResponse(frontend_dir / "profile.html")

    @app.get("/admin")
    def serve_admin():
        return FileResponse(frontend_dir / "admin.html")

    @app.get("/forgot-password")
    def serve_forgot_password():
        return FileResponse(frontend_dir / "forgot-password.html")

    @app.get("/reset-password")
    def serve_reset_password():
        return FileResponse(frontend_dir / "reset-password.html")

    @app.get("/spreadsheet")
    @app.get("/spreadsheet.html")
    @app.get("/sheets")
    @app.get("/excel")
    def serve_spreadsheet():
        target = frontend_dir / "spreadsheet.html" if frontend_dir else None
        if not target or not target.exists():
            target = root_dir / "spreadsheet.html"
        if target and target.exists():
            return FileResponse(target, media_type="text/html; charset=utf-8")
        return JSONResponse(status_code=404, content={"detail": "Spreadsheet editor page not found"})

    @app.get("/privacy")
    def serve_privacy():
        return FileResponse(frontend_dir / "privacy.html")

    @app.get("/favicon.ico", include_in_schema=False)
    def serve_favicon():
        target = (frontend_dir / "favicon.ico") if frontend_dir else None
        if not target or not target.exists():
            target = root_dir / "favicon.ico"
        if not target or not target.exists():
            target = root_dir / "assets" / "brand" / "favicon.ico"
        if target and target.exists():
            return FileResponse(target, media_type="image/x-icon")
        return FileResponse(root_dir / "assets" / "brand" / "frank-icon.png", media_type="image/png")

    @app.get("/favicon-48x48.png", include_in_schema=False)
    def serve_favicon_48():
        target = (frontend_dir / "favicon-48x48.png") if frontend_dir else None
        if not target or not target.exists():
            target = root_dir / "favicon-48x48.png"
        if not target or not target.exists():
            target = root_dir / "assets" / "brand" / "favicon-48x48.png"
        if target and target.exists():
            return FileResponse(target, media_type="image/png")
        return FileResponse(root_dir / "assets" / "brand" / "frank-icon.png", media_type="image/png")

    @app.get("/robots.txt")
    def serve_robots_txt():
        target = (frontend_dir / "robots.txt") if frontend_dir else None
        if not target or not target.exists():
            target = root_dir / "robots.txt"
        if target and target.exists():
            return FileResponse(target, media_type="text/plain; charset=utf-8")
        return Response(
            content="User-agent: *\nAllow: /\nAllow: /login\nAllow: /register\nAllow: /privacy\nAllow: /assets/\nAllow: /css/\nAllow: /js/\n\nDisallow: /dashboard*\nDisallow: /admin*\nDisallow: /profile*\nDisallow: /settings*\nDisallow: /forgot-password*\nDisallow: /reset-password*\nDisallow: /privacy-dashboard*\nDisallow: /api/\nDisallow: /uploads/\nDisallow: /ws/\n\nSitemap: https://fnk.vercel.app/sitemap.xml\n",
            media_type="text/plain; charset=utf-8"
        )

    @app.get("/sitemap.xml")
    def serve_sitemap_xml():
        target = (frontend_dir / "sitemap.xml") if frontend_dir else None
        if not target or not target.exists():
            target = root_dir / "sitemap.xml"
        if target and target.exists():
            return FileResponse(target, media_type="application/xml; charset=utf-8")
        sitemap_content = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            '  <url>\n'
            '    <loc>https://fnk.vercel.app/</loc>\n'
            '    <lastmod>2026-10-26</lastmod>\n'
            '    <changefreq>weekly</changefreq>\n'
            '    <priority>1.0</priority>\n'
            '  </url>\n'
            '  <url>\n'
            '    <loc>https://fnk.vercel.app/login</loc>\n'
            '    <lastmod>2026-10-26</lastmod>\n'
            '    <changefreq>monthly</changefreq>\n'
            '    <priority>0.8</priority>\n'
            '  </url>\n'
            '  <url>\n'
            '    <loc>https://fnk.vercel.app/register</loc>\n'
            '    <lastmod>2026-10-26</lastmod>\n'
            '    <changefreq>monthly</changefreq>\n'
            '    <priority>0.8</priority>\n'
            '  </url>\n'
            '  <url>\n'
            '    <loc>https://fnk.vercel.app/privacy</loc>\n'
            '    <lastmod>2026-10-26</lastmod>\n'
            '    <changefreq>monthly</changefreq>\n'
            '    <priority>0.7</priority>\n'
            '  </url>\n'
            '</urlset>\n'
        )
        return Response(content=sitemap_content, media_type="application/xml; charset=utf-8")

    @app.get("/404")
    def serve_404_page():
        target = (frontend_dir / "404.html") if frontend_dir else None
        if not target or not target.exists():
            target = root_dir / "404.html"
        if target and target.exists():
            return FileResponse(target, status_code=404)
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    @app.get("/{filename}.html")
    def serve_html_page(filename: str):
        target = frontend_dir / f"{filename}.html"
        if target.exists():
            return FileResponse(target)
        target_404 = frontend_dir / "404.html"
        if target_404.exists():
            return FileResponse(target_404, status_code=404)
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    @app.exception_handler(404)
    async def custom_404_handler(request: Request, exc):
        path = request.url.path
        if path.startswith("/api/") or path.startswith("/ws/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        target_404 = (frontend_dir / "404.html") if frontend_dir else None
        if not target_404 or not target_404.exists():
            target_404 = root_dir / "404.html"
        if target_404 and target_404.exists():
            return FileResponse(target_404, status_code=404)
        return JSONResponse(status_code=404, content={"detail": "Not Found"})


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=False)
