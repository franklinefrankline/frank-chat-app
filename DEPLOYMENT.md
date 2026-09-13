# FRANK — Complete Production Deployment Guide

**Brand Name:** FRANK  
**Tagline:** Think  
**GitHub Repository:** [https://github.com/franklinefrankline/frank-chat-app](https://github.com/franklinefrankline/frank-chat-app)  
**Production Frontend URL:** [https://frank-chat-vercel.app](https://frank-chat-vercel.app)

---

## 1. System Architecture

```
                    FRANK
                      |
                      |
                 VERCEL
                FRONTEND
      (https://frank-chat-vercel.app)
                      |
             HTTPS / WSS
                      |
                      v
              FASTAPI BACKEND
           (PaaS / ASGI Container)
                      |
          +-----------+-----------+
          |                       |
          v                       v
     PostgreSQL              File Storage
   (Managed DB)           (S3 / Cloudflare R2)
```

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

## 6. Verification Checklist

- [x] **Frontend**: Loads at `https://frank-chat-vercel.app` over HTTPS.
- [x] **Branding**: Displays `FRANK` with tagline `Think`.
- [x] **Logo Animation**: 8-step animation executes smoothly on splash/auth.
- [x] **Custom Cursor**: Desktop-only interactive F cursor with hover, click ripple, and trail.
- [x] **Database**: PostgreSQL connected with SSL and connection pooling.
- [x] **Authentication**: User registration, login, and JWT verification.
- [x] **Real-Time Messaging**: WebSocket (`wss://`) connects and relays messages.
- [x] **Timestamps**: UTC backend timestamps rendered accurately in local time.
- [x] **Documents & Video**: File uploads, download buttons, and native `<video controls>` playback.
- [x] **Mobile Responsiveness**: Clean layout on 320px–1280px+ viewports.
