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
from routes import auth, users, messages, groups, files, conversations
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
                # Clean up any legacy seeded demo users
                try:
                    conn.execute(text("DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE email IN ('alex@frank.app', 'sarah@frank.app', 'david@frank.app')) OR recipient_id IN (SELECT id FROM users WHERE email IN ('alex@frank.app', 'sarah@frank.app', 'david@frank.app'))"))
                    conn.execute(text("DELETE FROM conversations WHERE user_a_id IN (SELECT id FROM users WHERE email IN ('alex@frank.app', 'sarah@frank.app', 'david@frank.app')) OR user_b_id IN (SELECT id FROM users WHERE email IN ('alex@frank.app', 'sarah@frank.app', 'david@frank.app'))"))
                    conn.execute(text("DELETE FROM users WHERE email IN ('alex@frank.app', 'sarah@frank.app', 'david@frank.app')"))
                except Exception as del_err:
                    print(f"Demo cleanup note: {del_err}")
    except Exception as e:
        print(f"Migration note: {e}")

try:
    check_and_migrate_db()
except Exception as e:
    print(f"Migration init note: {e}")


# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app = FastAPI(
    title="FRANK API",
    description="FRANK real-time communication platform API",
    version="2.0.0"
)

# CORS configuration
default_origins = [
    "https://frank-chat-vercel.app",
    "https://frank-chat-vercel.vercel.app",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:3000"
]

env_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
frontend_url = os.getenv("FRONTEND_URL", "").strip()
if frontend_url and frontend_url not in default_origins:
    default_origins.append(frontend_url)

allowed_origins = list(set(default_origins + env_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in env_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(groups.router)
app.include_router(files.router)


# WebSocket Gateway
@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    await handle_websocket_connection(websocket, token)


@app.get("/api/health")
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
