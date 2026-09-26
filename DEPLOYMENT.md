# FRANK — Complete Production Deployment Guide

**Brand Name:** FRANK  
**Tagline:** Think  
**GitHub Repository:** [https://github.com/franklinefrankline/frank-chat-app](https://github.com/franklinefrankline/frank-chat-app)  
**Production Application URL:** [https://frank-chat-app.vercel.app](https://frank-chat-app.vercel.app)  
**Production Health Endpoint:** [https://frank-chat-app.vercel.app/health](https://frank-chat-app.vercel.app/health)  
**Uptime Monitoring Guide:** [`UPTIMEROBOT.md`](file:///c:/Users/inbat/Downloads/frank-chat-app-main/frank-chat-app-main/UPTIMEROBOT.md)

---

## 1. Production Architecture

```
                    FRANK
                      |
                      |
                 VERCEL FRONTEND
         (https://frank-chat-app.vercel.app)
                      |
                      v
             PRODUCTION FASTAPI BACKEND
                      |
                      v
            PERSISTENT POSTGRESQL
                      ^
                      |
                 UPTIMEROBOT
                      |
                      v
                 GET /health
          {"status":"ok","database":"connected"}
```

### Core Architecture Rules:
- **UPTIMEROBOT = BACKEND UPTIME MONITORING & KEEP-ALIVE**
- **POSTGRESQL = PERMANENT USER DATA STORAGE**
- **BOTH MUST BE USED TOGETHER.**
- Health check is **strictly read-only** (`SELECT 1`) and will **NEVER** reset, delete, truncate, or recreate database records.

---

## 2. Frontend Deployment (Vercel)

The frontend is pure, high-performance static HTML/CSS/JavaScript with zero build dependencies.

### Step 1: Connect Repository to Vercel
1. Log in to [vercel.com](https://vercel.com) and click **"Add New Project"**.
2. Import the Git repository: `https://github.com/franklinefrankline/frank-chat-app`.
3. Configure project settings:
   - **Project Name:** `frank-chat-vercel`
   - **Framework Preset:** Other
   - **Root Directory:** `./` (or leave default root)
   - **Build Command:** *(Leave empty)*
   - **Output Directory:** *(Leave empty)*

### Step 2: Configure Vercel Domain
Under **Project Settings > Domains**:
- Add `frank-chat-vercel.app` (or custom domain).
- Ensure SSL certificate is generated automatically by Vercel.

### Step 3: Verify SPA Routing
The included [`vercel.json`](file:///d:/chat-app/vercel.json) automatically handles clean URLs and rewrites:
- `/login` → `/frontend/login.html`
- `/register` → `/frontend/register.html`
- `/dashboard` → `/frontend/dashboard.html`
- `/chat` → `/frontend/dashboard.html`
- `/settings` → `/frontend/settings.html`
- `/profile` → `/frontend/profile.html`

---

## 3. Backend Deployment (FastAPI + WebSockets)

Because WebSocket connections (`wss://`) require a persistent long-lived connection, use a persistent container or PaaS provider (Render, Railway, Fly.io, or VPS).

### Option A: 1-Click Render Deployment (Recommended)
1. Go to [dashboard.render.com](https://dashboard.render.com) and select **"Blueprints" > "New Blueprint Instance"**.
2. Connect `https://github.com/franklinefrankline/frank-chat-app`.
3. Render will detect [`render.yaml`](file:///d:/chat-app/render.yaml) and automatically provision:
   - A managed PostgreSQL database (`frank-postgres`)
   - An ASGI Web Service (`frank-backend`)
4. Copy your backend service URL (e.g., `https://frank-backend-xyz.onrender.com`).

### Option B: Railway Deployment
1. Go to [railway.app](https://railway.app) and create a **New Project > Deploy from GitHub Repo**.
2. Add a **PostgreSQL** database service.
3. In the Web Service settings:
   - Start command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Connect the PostgreSQL database variable (`DATABASE_URL`).
4. Generate a public domain under service settings (e.g. `https://frank-production.up.railway.app`).

### Option C: Docker / VPS Deployment
1. Build and run via Docker Compose:
   ```bash
   docker-compose up -d --build
   ```
2. Place behind Nginx or Caddy with SSL reverse proxying `/` and WebSocket `/ws/`.

---

## 4. Production Environment Variables Reference

Configure these environment variables in your backend hosting service:

| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `SECRET_KEY` | 32+ character random key for JWT tokens | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | Environment identifier | `production` |
| `FRONTEND_URL` | Production frontend domain | `https://frank-chat-vercel.app` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `https://frank-chat-vercel.app,https://frank-chat-vercel.vercel.app` |
| `PORT` | ASGI listening port | Provided automatically by host (e.g. `8000` / `10000`) |
| `MAX_FILE_SIZE_MB` | Maximum document upload size | `25` |
| `MAX_VIDEO_SIZE_MB` | Maximum video upload size | `50` |
| `STORAGE_BUCKET` | *(Optional)* S3 / R2 Bucket name | `frank-media-bucket` |
| `STORAGE_ENDPOINT` | *(Optional)* S3 / R2 Endpoint URL | `https://<account-id>.r2.cloudflarestorage.com` |
| `STORAGE_ACCESS_KEY` | *(Optional)* S3 Access Key ID | `your-s3-access-key` |
| `STORAGE_SECRET_KEY` | *(Optional)* S3 Secret Key | `your-s3-secret-key` |

---

## 5. Connecting Frontend to Backend

In [`frontend/js/config.js`](file:///d:/chat-app/frontend/js/config.js), set your production backend domain:
```javascript
const DEFAULT_PROD_API = 'https://YOUR-BACKEND-DOMAIN.com';
const DEFAULT_PROD_WS  = 'wss://YOUR-BACKEND-DOMAIN.com';
```
Or dynamically configure via the client browser console or bookmarklet:
```javascript
localStorage.setItem('frank_api_url', 'https://YOUR-BACKEND-DOMAIN.com');
localStorage.setItem('frank_ws_url', 'wss://YOUR-BACKEND-DOMAIN.com');
```

---

## 6. Production UptimeRobot Configuration

This project **MUST** use UptimeRobot for production backend uptime monitoring:

1. Create an HTTP(s) monitor in [UptimeRobot](https://uptimerobot.com):
   - **URL:** `https://frank-chat-app.vercel.app/health`
   - **Method:** `HEAD` or `GET`
   - **Interval:** `5 minutes` (or `1 minute`)
   - **Expected Status:** `200`
   - **Expected Response:** `{"status": "ok", "database": "connected"}`
2. **Permanent Data Storage**: All user data, credentials, FRANK IDs, conversations, and messages permanently live in **PostgreSQL**.
3. **No Database Reset**: The `/health` endpoint is strictly read-only (`SELECT 1`) and will **NEVER** reset, drop, truncate, or alter any database state.
4. Run automated 15-step verification:
   ```bash
   python tests/test_production_uptimerobot_suite.py
   ```

---

## 7. Verification Checklist

- [x] **Frontend**: Loads at `https://frank-chat-app.vercel.app` over HTTPS.
- [x] **Branding**: Displays `FRANK` with tagline `Think`.
- [x] **Database**: PostgreSQL connected with SSL and connection pooling.
- [x] **Data Persistence**: User accounts, FRANK IDs, conversations, messages remain intact across restarts and redeploys.
- [x] **Health Check**: Lightweight `GET /health` returns `{"status": "ok", "database": "connected"}`.
- [x] **UptimeRobot**: UptimeRobot monitor active at `https://frank-chat-app.vercel.app/health`.
- [x] **Authentication**: User registration, login, and JWT verification.
- [x] **Real-Time Messaging**: Real-time messaging and multi-instance sync engine.
- [x] **Timestamps**: UTC backend timestamps rendered accurately in local time.
- [x] **Documents & Video**: File uploads, chunked uploads, download buttons, and native `<video controls>` playback.
- [x] **Mobile Responsiveness**: Clean layout on 320px–1280px+ viewports.
