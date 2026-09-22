import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path when imported as backend.main
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from database import engine, Base, SessionLocal
import models
from security import hash_password
from routes import auth, users, messages, groups, files, admin
from websocket.chat import handle_websocket_connection

# Create database tables automatically
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Table creation note: {e}")

def check_and_migrate_db():
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if "messages" in inspector.get_table_names():
            columns = [col["name"] for col in inspector.get_columns("messages")]
            with engine.begin() as conn:
                if "message_type" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'"))
                if "file_id" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN file_id INTEGER NULL"))
                if "updated_at" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN updated_at TIMESTAMP NULL"))
    except Exception as e:
        print(f"Migration note: {e}")

try:
    check_and_migrate_db()
except Exception as e:
    print(f"Migration init note: {e}")


# Seed initial demo users if database is newly initialized
def seed_demo_users():
    db = SessionLocal()
    try:
        # Ensure default administrator exists
        admin_user = db.query(models.User).filter(models.User.username == "admin").first()
        if not admin_user:
            admin_user = models.User(
                username="admin",
                email="admin@frank.app",
                frank_id="ADM001",
                full_name="FRANK Administrator",
                bio="System Administrator",
                hashed_password=hash_password("Admin@123456"),
                role="admin",
                account_status="active",
                is_online=False
            )
            db.add(admin_user)
            db.commit()

        if db.query(models.User).filter(models.User.role != "admin").count() == 0:
            demo_users = [
                {
                    "username": "alex",
                    "email": "alex@frank.app",
                    "frank_id": "F4M8Q1",
                    "full_name": "Alex Morgan",
                    "bio": "Product Designer & Tech Enthusiast 🚀",
                    "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
                    "is_online": True
                },
                {
                    "username": "sarah",
                    "email": "sarah@frank.app",
                    "frank_id": "K7P2X9",
                    "full_name": "Sarah Connor",
                    "bio": "Building the future of real-time communication.",
                    "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
                    "is_online": True
                },
                {
                    "username": "david",
                    "email": "david@frank.app",
                    "frank_id": "B3N8R5",
                    "full_name": "David Chen",
                    "bio": "Software Architect & Open Source Contributor.",
                    "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
                    "is_online": False
                }
            ]

            created = []
            for u in demo_users:
                user = models.User(
                    username=u["username"],
                    email=u["email"],
                    frank_id=u["frank_id"],
                    full_name=u["full_name"],
                    bio=u["bio"],
                    avatar_url=u["avatar_url"],
                    hashed_password=hash_password("password123"),
                    role="user",
                    account_status="active",
                    is_online=u["is_online"]
                )
                db.add(user)
                created.append(user)
            db.commit()

            # Seed an introductory welcome message from Alex to Sarah
            if len(created) >= 2:
                intro_msg = models.Message(
                    sender_id=created[0].id,
                    recipient_id=created[1].id,
                    content="Welcome to FRANK! Feel free to test real-time messaging, emoji reactions, and reply threads.",
                    status="read"
                )
                db.add(intro_msg)
                db.commit()

    except Exception as e:
        print(f"Seed note: {e}")
    finally:
        db.close()

seed_demo_users()


# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        path = request.url.path
        if "/files/" in path and ("/view" in path or "/download" in path):
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
            response.headers["Content-Security-Policy"] = "frame-ancestors 'self' *"
        else:
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app = FastAPI(
    title="FRANK API",
    description="FRANK real-time communication platform API",
    version="2.0.0"
)

# CORS configuration
default_origins = [
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
    allow_origins=allowed_origins if "*" not in env_origins else ["*"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(SecurityHeadersMiddleware)

# Handle both /api/... and stripped paths in case of serverless path rewriting
@app.middleware("http")
async def ensure_api_prefix(request: Request, call_next):
    path = request.url.path
    for pfx in ["/auth", "/users", "/messages", "/groups", "/files", "/health", "/admin"]:
        if path.startswith(pfx):
            request.scope["path"] = "/api" + path
            break
    response = await call_next(request)
    return response

# Include Routers with both /api prefix and root prefix
for r in [auth.router, users.router, messages.router, groups.router, files.router, admin.router]:
    app.include_router(r, prefix="/api")
    app.include_router(r)


# WebSocket Gateway
@app.websocket("/ws/{token}")
@app.websocket("/api/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    await handle_websocket_connection(websocket, token)


@app.get("/")
@app.get("/api")
@app.get("/api/")
@app.get("/api/index.py")
@app.get("/api/health")
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "FRANK Backend",
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

if frontend_dir and frontend_dir.exists():
    if (frontend_dir / "css").exists():
        app.mount("/css", StaticFiles(directory=str(frontend_dir / "css")), name="css")
    if (frontend_dir / "js").exists():
        app.mount("/js", StaticFiles(directory=str(frontend_dir / "js")), name="js")
    if (frontend_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_dir / "assets")), name="assets")

    @app.get("/")
    def serve_landing():
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

    @app.get("/{filename}.html")
    def serve_html_page(filename: str):
        target = frontend_dir / f"{filename}.html"
        if target.exists():
            return FileResponse(target)
        return FileResponse(frontend_dir / "404.html", status_code=404)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=False)
