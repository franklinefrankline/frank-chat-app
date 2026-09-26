# FRANK

**Think**

A modern real-time communication platform built with a FastAPI Python backend, PostgreSQL/SQLite database, Vanilla JavaScript frontend, REST APIs, and persistent WebSocket-based messaging.

---

## ⚡ Architecture Overview

```
                        FRANK
                          |
                          v
                 VERCEL FRONTEND
          (https://frank-chat-app.vercel.app)
                          |
                     HTTPS / WSS
                          |
                          v
                   FASTAPI BACKEND
             (ASGI / Uvicorn on Port $PORT)
                          |
             +------------+------------+
             |                         |
             v                         v
        PostgreSQL                File Storage
   (Neon / Supabase / Render)  (S3 / R2 / Local Disk)
```

---

## 🚀 Key Capabilities

- **Real-Time WebSocket Messaging**: Instant message delivery with reconnection backoff, heartbeat, and presence indicators.
- **Accurate Timestamps**: UTC ISO 8601 storage on backend, formatted accurately to the user's local timezone.
- **Document & Video Sharing**: PDF, Word, Excel, PowerPoint, Text, Archives, and native HTML5 video playback (MP4, MOV, WEBM, MKV).
- **Group Channels**: Channel creation, role management, member invitations, and real-time event broadcasting.
- **Security**: JWT authentication, bcrypt password hashing, input sanitization, and path-traversal prevention.
- **FRANK Brand Identity**:
  - Logo: F-shaped communication emblem with Electric Blue, Cyan, Violet, and Magenta gradients.
  - Tagline: **Think**.
  - Desktop Custom Cursor: Interactive cursor with hover states, click ripple, and subtle motion trail.
  - 8-Step Logo Animation: Multi-phase entrance animation respecting `prefers-reduced-motion`.

---

## 🛠️ Quick Local Setup

### 1. Clone & Setup Python Virtual Environment
```bash
git clone https://github.com/franklinefrankline/frank-chat-app.git
cd frank-chat-app

python -m venv backend/venv
# Windows
.\backend\venv\Scripts\activate
# macOS/Linux
source backend/venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
cd backend
python main.py
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 🚢 Production Deployment

For detailed production deployment instructions across **Vercel** (Frontend) and **Render / Railway / Docker** (Backend & PostgreSQL), refer to:
- 👉 [**DEPLOYMENT.md**](file:///c:/Users/inbat/Downloads/frank-chat-app-main/frank-chat-app-main/DEPLOYMENT.md) — Full production deployment manual
- 👉 [**UPTIMEROBOT.md**](file:///c:/Users/inbat/Downloads/frank-chat-app-main/frank-chat-app-main/UPTIMEROBOT.md) — UptimeRobot monitoring, persistent PostgreSQL & health endpoint guide
