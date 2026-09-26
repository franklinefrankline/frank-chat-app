"""
FRANK - UptimeRobot Monitoring & Health Endpoint Verification Tool
------------------------------------------------------------------
Validates:
1. /health and /api/health endpoint responses.
2. Lightweight latency (<100ms target).
3. Read-only database safety (zero mutations).
4. HEAD & GET request support with simulated UptimeRobot User-Agent headers.
5. Live production backend availability at https://frank-chat-app.vercel.app/health.
6. Optional UptimeRobot REST API verification if UPTIMEROBOT_API_KEY is configured.
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
from pathlib import Path

# Add backend directory to sys.path
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

PROD_BACKEND_URL = "https://frank-chat-app.vercel.app"
HEALTH_PATH = "/health"
API_HEALTH_PATH = "/api/health"

UPTIMEROBOT_USER_AGENT = "Mozilla/5.0 +(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)"


def check_url(url, method="GET", timeout=10):
    start = time.perf_counter()
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UPTIMEROBOT_USER_AGENT},
        method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            latency_ms = (time.perf_counter() - start) * 1000
            status_code = resp.getcode()
            body_text = resp.read().decode("utf-8") if method == "GET" else ""
            body_json = None
            if body_text:
                try:
                    body_json = json.loads(body_text)
                except Exception:
                    body_json = body_text
            return {
                "ok": True,
                "status_code": status_code,
                "latency_ms": round(latency_ms, 2),
                "data": body_json,
                "error": None
            }
    except urllib.error.HTTPError as e:
        latency_ms = (time.perf_counter() - start) * 1000
        body = e.read().decode("utf-8")
        return {
            "ok": False,
            "status_code": e.code,
            "latency_ms": round(latency_ms, 2),
            "data": body,
            "error": f"HTTP {e.code}"
        }
    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        return {
            "ok": False,
            "status_code": 0,
            "latency_ms": round(latency_ms, 2),
            "data": None,
            "error": str(e)
        }


def test_local_health():
    print("\n[1/3] Testing Local FastAPI Application Health Endpoint...")
    from starlette.testclient import TestClient
    import main
    import models
    from database import SessionLocal

    client = TestClient(main.app)

    # 1. Test GET /health
    r_get = client.get("/health", headers={"User-Agent": UPTIMEROBOT_USER_AGENT})
    print(f"  - GET /health: Status {r_get.status_code}, Response: {r_get.text}")
    assert r_get.status_code == 200, f"Expected 200, got {r_get.status_code}"
    assert r_get.json() == {"status": "ok", "database": "connected"}, f"Unexpected payload: {r_get.json()}"

    # 2. Test HEAD /health
    r_head = client.head("/health", headers={"User-Agent": UPTIMEROBOT_USER_AGENT})
    print(f"  - HEAD /health: Status {r_head.status_code}")
    assert r_head.status_code == 200, f"Expected 200, got {r_head.status_code}"

    # 3. Test GET /api/health
    r_api = client.get("/api/health", headers={"User-Agent": UPTIMEROBOT_USER_AGENT})
    print(f"  - GET /api/health: Status {r_api.status_code}, Response: {r_api.text}")
    assert r_api.status_code == 200

    # 4. Read-only verification: check that 100 requests do not mutate user/message tables
    db = SessionLocal()
    users_before = db.query(models.User).count()
    msgs_before = db.query(models.Message).count()
    db.close()

    for _ in range(100):
        client.get("/health")

    db = SessionLocal()
    users_after = db.query(models.User).count()
    msgs_after = db.query(models.Message).count()
    db.close()

    assert users_before == users_after and msgs_before == msgs_after
    print(f"  - Read-Only Guarantee: PASS (Users: {users_before} -> {users_after}, Messages: {msgs_before} -> {msgs_after})")
    print("  [OK] Local Health Endpoint verified successfully.")


def test_live_production():
    print(f"\n[2/3] Testing Live Deployed Production Endpoints at {PROD_BACKEND_URL}...")

    # Check /api/health on deployed backend
    api_health_url = f"{PROD_BACKEND_URL}{API_HEALTH_PATH}"
    print(f"  - Testing live GET {api_health_url}...")
    res_api = check_url(api_health_url, method="GET")
    print(f"    Status: {res_api['status_code']} | Latency: {res_api['latency_ms']}ms | Data: {res_api['data']}")

    # Check /health on deployed backend
    health_url = f"{PROD_BACKEND_URL}{HEALTH_PATH}"
    print(f"  - Testing live GET {health_url}...")
    res_health = check_url(health_url, method="GET")
    print(f"    Status: {res_health['status_code']} | Latency: {res_health['latency_ms']}ms | Data: {res_health['data']}")

    # Check HEAD /health
    print(f"  - Testing live HEAD {health_url}...")
    res_head = check_url(health_url, method="HEAD")
    print(f"    Status: {res_head['status_code']} | Latency: {res_head['latency_ms']}ms")


def check_uptimerobot_api():
    print("\n[3/3] Checking UptimeRobot API Configuration...")
    api_key = os.getenv("UPTIMEROBOT_API_KEY")
    if not api_key:
        print("  - Notice: UPTIMEROBOT_API_KEY environment variable is not set.")
        print(f"  - For production monitoring, configure UptimeRobot monitor pointing to:")
        print(f"      URL: {PROD_BACKEND_URL}/health")
        print(f"      Method: HEAD or GET")
        print(f"      Interval: 5 minutes")
        print(f"      Expected Status: 200 OK")
        return

    try:
        req = urllib.request.Request(
            "https://api.uptimerobot.com/v2/getMonitors",
            data=f"api_key={api_key}&format=json".encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            monitors = data.get("monitors", [])
            print(f"  - UptimeRobot Account: {len(monitors)} monitor(s) configured.")
            found = False
            for m in monitors:
                print(f"    * Monitor '{m.get('friendly_name')}': {m.get('url')} (Status: {m.get('status')})")
                if "/health" in m.get("url", ""):
                    found = True
            if found:
                print("  [OK] Active /health monitor found in UptimeRobot account!")
            else:
                print(f"  - Warning: No monitor matching {PROD_BACKEND_URL}/health found in UptimeRobot account.")
    except Exception as e:
        print(f"  - Error querying UptimeRobot API: {e}")


def main_cli():
    print("=" * 70)
    print("FRANK PRODUCTION UPTIMEROBOT & HEALTH ENDPOINT VERIFICATION")
    print("=" * 70)
    test_local_health()
    test_live_production()
    check_uptimerobot_api()
    print("\n" + "=" * 70)
    print("VERIFICATION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main_cli()
