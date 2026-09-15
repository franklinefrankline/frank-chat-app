# FRANK

**Think**

A modern real-time communication platform built with a FastAPI backend, PostgreSQL/SQLite database, Vanilla JavaScript frontend, REST APIs and WebSocket-based real-time communication.

## Architecture

* **Backend**: FastAPI (Python 3.9+), SQLAlchemy 2.0 ORM, JWT authentication, WebSockets real-time gateway, SQLite (default) / PostgreSQL support.
* **Frontend**: Pure HTML5, Vanilla CSS3 (Custom design system tokens, responsive grid & flexbox, dark/light theme support), Modular Vanilla JavaScript (`api.js`, `websocket.js`, `chat.js`, `auth.js`, `notifications.js`, etc.).
* **Security**: Passwords hashed securely, JWT bearer authorization, WebSocket token verification, CORS protection, SQL injection prevention via ORM parameterization, XSS-safe DOM encoding.

## Running FRANK

### 1. Start the Backend Server
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The FastAPI backend automatically serves the frontend at `http://localhost:8000/`.
API documentation is available at `http://localhost:8000/docs`.

### 2. Frontend Only (Static Preview)
Alternatively, you can open `frontend/index.html` or run any static server (like Python `python -m http.server 3000` inside `frontend/`).

