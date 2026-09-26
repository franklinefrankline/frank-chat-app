# FRANK — Production UptimeRobot & PostgreSQL Architecture Guide

**Brand Name:** FRANK  
**Tagline:** Think  
**Production Application URL:** [https://frank-chat-app.vercel.app](https://frank-chat-app.vercel.app)  
**Production Health Endpoint:** [https://frank-chat-app.vercel.app/health](https://frank-chat-app.vercel.app/health)  
**Alternative Health Endpoint:** [https://frank-chat-app.vercel.app/api/health](https://frank-chat-app.vercel.app/api/health)

---

## 1. System Production Architecture

```
                 +-----------------------------+
                 |       Vercel Frontend       |
                 | (https://frank-chat-app...) |
                 +--------------+--------------+
                                |
                                v
                 +-----------------------------+
                 |     Production Backend      |
                 |      (FastAPI Engine)       |
                 +--------------+--------------+
                                |
                                v
                 +-----------------------------+
                 |    Persistent PostgreSQL    |
                 |      (Database Storage)     |
                 +--------------^--------------+
                                |
                  +-------------+-------------+
                  |                           |
                  |     UptimeRobot Cloud     |
                  |        (Monitoring)       |
                  +-------------+-------------+
                                |
                                v
                 GET /health (HTTP 200 OK)
                 {"status":"ok","database":"connected"}
```

### Core Principle & Separation of Concerns

```
=============================================================
UPTIMEROBOT = BACKEND UPTIME MONITORING & KEEP-ALIVE
POSTGRESQL  = PERMANENT USER DATA STORAGE (IMMUTABLE)
BOTH MUST BE USED TOGETHER IN PRODUCTION.
=============================================================
```

- **UptimeRobot** is solely an external availability monitor and wake-up agent. It periodically queries `GET /health` to detect outages, monitor response latency, and prevent cold-boot delays on serverless/wake-on-request hosting.
- **UptimeRobot is NOT the database.** UptimeRobot never stores, mutates, or controls user accounts or message history.
- **PostgreSQL** is the sole persistent store. All user accounts, credentials, FRANK IDs, conversations, messages, reactions, and files permanently reside in PostgreSQL.

---

## 2. Lightweight Health Endpoint Specification

### Endpoint: `GET /health` (Also supports `HEAD /health`, `GET /api/health`, `HEAD /api/health`)

#### Successful Response (`HTTP 200 OK`)
```json
{
  "status": "ok",
  "database": "connected"
}
```

#### Degraded Response (`HTTP 503 Service Unavailable`)
```json
{
  "status": "error",
  "database": "disconnected"
}
```

### Strict Read-Only & Zero Database Reset Guarantee

The health endpoint is strictly read-only:
- Executes an isolated ping: `SELECT 1` via `engine.connect()`.
- **NEVER** executes `DROP TABLE` or `TRUNCATE TABLE`.
- **NEVER** deletes users or messages.
- **NEVER** alters user profiles, passwords, or theme settings.
- **NEVER** creates duplicate demo or test users.
- Automated tests verify zero database row changes across 100+ consecutive `/health` calls.

---

## 3. Permanent User Data in PostgreSQL

Even if UptimeRobot is temporarily paused or unreachable, or if the backend restarts, wakes, sleeps, redeploys, or crashes, **USER DATA IS NEVER LOST**.

The persistent PostgreSQL database permanently preserves:

| Category | Database Columns / Tables | Purpose |
|---|---|---|
| **User Identity** | `users.id` | Permanent integer primary key |
| **User Name** | `users.full_name` | Display name of the user |
| **User Email** | `users.email` | Unique login email |
| **Password Hash** | `users.hashed_password` | Secure bcrypt password hash |
| **FRANK ID** | `users.frank_id` | Permanent 6-character identifier (e.g., `SO03QL`) |
| **Role** | `users.role` | Access level (`admin` / `user`) |
| **Account Status** | `users.account_status` | Status (`active` / `disabled`) |
| **Created Date** | `users.created_at` | UTC registration timestamp |
| **Profile Data** | `users.bio`, `users.avatar_url` | User profile biography & avatar URL |
| **Settings & Theme** | `users.theme`, `users.status` | Theme preference (e.g., `light`, `dark`, `sandstone`) |
| **Conversations** | `conversations` table | 1-to-1 conversation pairings & preferences |
| **Groups** | `groups`, `group_members` tables | Group metadata, ownership & membership |
| **Messages** | `messages`, `reactions`, `documents` | Full message history, attachments & reactions |

### Strict Storage Requirement
The `DATABASE_URL` environment variable must point to the persistent production PostgreSQL database (e.g. Supabase, Neon, Render PostgreSQL, Railway PostgreSQL, AWS RDS):
- **DO NOT** use in-memory databases (`:memory:`).
- **DO NOT** use temporary SQLite or `/tmp` filesystem in production.
- **DO NOT** use JSON user storage.
- **DO NOT** use localhost databases in production.

---

## 4. Configuring UptimeRobot for Production

### Option A: Web Dashboard (Recommended)

1. Log in to [UptimeRobot Dashboard](https://uptimerobot.com/dashboard).
2. Click **"+ Add New Monitor"**.
3. Configure the monitor parameters:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `FRANK Production Backend`
   - **URL (or IP):** `https://frank-chat-app.vercel.app/health`
   - **Monitoring Interval:** `5 minutes` (or `1 minute` for high-frequency wake-on-request)
   - **Monitor Timeout:** `30 seconds`
   - **HTTP Method:** `HEAD` or `GET`
   - **Alert Contacts:** Select your email or Slack / Webhook
4. Under **Advanced Settings**:
   - **Custom HTTP Status Codes:** `200` (Default)
   - **Keyword Monitoring (Optional):** Alert if page does NOT contain `"connected"`
5. Click **"Create Monitor"**.

### Option B: Automated REST API Setup

You can provision or check the monitor automatically using the UptimeRobot API:

```bash
curl -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "api_key=YOUR_UPTIMEROBOT_API_KEY" \
  -d "format=json" \
  -d "type=1" \
  -d "friendly_name=FRANK Production Backend" \
  -d "url=https://frank-chat-app.vercel.app/health" \
  -d "interval=300" \
  -d "http_method=2"
```

---

## 5. Automated Verification & Testing Protocol

The repository includes an automated 15-step test suite validating the entire lifecycle:

```bash
python tests/test_production_uptimerobot_suite.py
```

### The 15 Verified Steps:

1. **Register a new FRANK user** via `POST /api/auth/register`.
2. **Verify user exists in PostgreSQL** (validates user ID, name, email, password hash, FRANK ID, role, account status, created date, profile data, settings, theme).
3. **Verify the permanent FRANK ID** (6-character format).
4. **Logout** (session teardown).
5. **Login again** with email and password.
6. **Restart the backend** (dispose connection pool, recycle engine).
7. **Login again** post-restart.
8. **Verify the same user** (same user ID, email, and name).
9. **Verify the same FRANK ID** (permanent identifier unchanged).
10. **Verify conversations and messages remain** (message content intact across restart).
11. **Check /health** endpoint returns `HTTP 200` with `{"status": "ok", "database": "connected"}`.
12. **Verify UptimeRobot can reach /health** (simulated UptimeRobot User-Agent headers, `HEAD` and `GET`).
13. **Redeploy the backend** (cold-boot application re-instantiation).
14. **Login again** post-redeploy.
15. **Verify the same account still exists** with 100% of user data and messages intact.

### Running Live Verification Tool:

```bash
python scripts/verify_uptimerobot.py
```
This utility:
- Tests local `/health` and `/api/health`.
- Verifies read-only safety across 100 rapid health checks.
- Checks live deployed URL `https://frank-chat-app.vercel.app/health`.
- Validates UptimeRobot API status if `UPTIMEROBOT_API_KEY` is provided.

---

## 6. Routing Configuration in `vercel.json`

The [`vercel.json`](file:///c:/Users/inbat/Downloads/frank-chat-app-main/frank-chat-app-main/vercel.json) file guarantees clean routing to the health check:

```json
{
  "rewrites": [
    { "source": "/health", "destination": "/api/index.py" },
    { "source": "/api/health", "destination": "/api/index.py" },
    { "source": "/api/(.*)", "destination": "/api/index.py" },
    { "source": "/api", "destination": "/api/index.py" }
  ]
}
```
This enables both `https://frank-chat-app.vercel.app/health` and `https://frank-chat-app.vercel.app/api/health` to resolve directly to the FastAPI health handler.
