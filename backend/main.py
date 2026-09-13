import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from database import engine, Base, SessionLocal
import models
from security import hash_password
from routes import auth, users, messages, groups, files
from websocket.chat import handle_websocket_connection

# Create database tables automatically
Base.metadata.create_all(bind=engine)

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

check_and_migrate_db()


# Seed initial demo users if database is newly initialized
def seed_demo_users():
    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            demo_users = [
                {
                    "username": "alex",
                    "email": "alex@qenvo.io",
                    "full_name": "Alex Morgan",
                    "bio": "Product Designer & Tech Enthusiast 🚀",
                    "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
                    "is_online": True
                },
                {
                    "username": "sarah",
                    "email": "sarah@qenvo.io",
                    "full_name": "Sarah Connor",
                    "bio": "Building the future of real-time communication.",
                    "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
                    "is_online": True
                },
                {
                    "username": "david",
                    "email": "david@qenvo.io",
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
                    full_name=u["full_name"],
                    bio=u["bio"],
                    avatar_url=u["avatar_url"],
                    hashed_password=hash_password("password123"),
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
                    content="Welcome to QENVO! Feel free to test real-time messaging, emoji reactions, and reply threads.",
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
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app = FastAPI(
    title="QENVO API",
    description="QENVO real-time communication platform API",
    version="2.0.0"
)

# CORS configuration
allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
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
        "service": "QENVO Backend",
        "version": "2.0.0"
    }


# Frontend Static Files Serving
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/css", StaticFiles(directory=str(frontend_dir / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(frontend_dir / "js")), name="js")
    if (frontend_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_dir / "assets")), name="assets")

    @app.get("/")
    def serve_landing():
        return FileResponse(frontend_dir / "index.html")

    @app.get("/{filename}.html")
    def serve_html_page(filename: str):
        target = frontend_dir / f"{filename}.html"
        if target.exists():
            return FileResponse(target)
        return FileResponse(frontend_dir / "404.html", status_code=404)
