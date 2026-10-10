"""
Live Vercel Production Performance & Latency Benchmark Test
Tests directly against https://frank-chat-app.vercel.app
"""

import time
import json
import urllib.request
import urllib.error
from sqlalchemy import create_engine, text

PROD_URL = "https://frank-chat-app.vercel.app"
NEON_URL = "postgresql+pg8000://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb"

def api_call(endpoint, method="GET", data=None, token=None):
    url = f"{PROD_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            elapsed = (time.perf_counter() - t0) * 1000
            return resp.status, json.loads(content) if content else {}, elapsed
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        elapsed = (time.perf_counter() - t0) * 1000
        try:
            err_json = json.loads(content)
        except Exception:
            err_json = {"detail": content}
        return e.code, err_json, elapsed

def run_live_benchmark():
    print("=" * 75)
    print(f"LIVE VERCEL PERFORMANCE & FUNCTIONALITY VERIFICATION")
    print(f"Target: {PROD_URL}")
    print("=" * 75)

    # 1. Health check
    status, health, dur = api_call("/api/health")
    print(f"[{'PASS' if status == 200 else 'FAIL'}] GET /api/health                   | Status: {status} | Latency: {dur:6.1f}ms | DB: {health.get('database')}")
    assert status == 200

    # 2. Admin Authentication
    status, auth_res, dur = api_call("/api/auth/login", method="POST", data={
        "username": "frankline30999112@gmail.com",
        "password": "#Frankline2006"
    })
    print(f"[{'PASS' if status == 200 else 'FAIL'}] POST /api/auth/login               | Status: {status} | Latency: {dur:6.1f}ms | User: {auth_res.get('user', {}).get('full_name')}")
    assert status == 200
    token = auth_res["access_token"]
    user_id = auth_res["user"]["id"]

    # 3. Conversations list (batched bulk queries)
    status, convs, dur = api_call("/api/users/conversations", token=token)
    print(f"[{'PASS' if status == 200 else 'FAIL'}] GET /api/users/conversations        | Status: {status} | Latency: {dur:6.1f}ms | Convs: {len(convs)}")
    assert status == 200

    # 4. Direct Messages
    status, msgs, dur = api_call(f"/api/messages/direct/{user_id}", token=token)
    print(f"[{'PASS' if status == 200 else 'FAIL'}] GET /api/messages/direct/{user_id}      | Status: {status} | Latency: {dur:6.1f}ms | Msgs: {len(msgs)}")
    assert status == 200

    # 5. Admin Metrics (single-trip aggregation)
    status, metrics, dur = api_call("/api/admin/metrics", token=token)
    print(f"[{'PASS' if status == 200 else 'FAIL'}] GET /api/admin/metrics              | Status: {status} | Latency: {dur:6.1f}ms | Total Users: {metrics.get('total_users')}")
    assert status == 200

    # 6. Admin Users List
    status, users_res, dur = api_call("/api/admin/users?limit=15", token=token)
    print(f"[{'PASS' if status == 200 else 'FAIL'}] GET /api/admin/users                | Status: {status} | Latency: {dur:6.1f}ms | Users returned: {len(users_res.get('users', []))}")
    assert status == 200

    # 7. Admin Groups Metadata (batched IN queries)
    status, groups_res, dur = api_call("/api/admin/groups", token=token)
    print(f"[{'PASS' if status == 200 else 'FAIL'}] GET /api/admin/groups               | Status: {status} | Latency: {dur:6.1f}ms | Groups: {len(groups_res)}")
    assert status == 200

    # 8. Admin Audit Logs (batched admin users)
    status, audit_res, dur = api_call("/api/admin/audit-logs", token=token)
    print(f"[{'PASS' if status == 200 else 'FAIL'}] GET /api/admin/audit-logs           | Status: {status} | Latency: {dur:6.1f}ms | Logs: {len(audit_res.get('logs', []))}")
    assert status == 200

    # 9. Verify production database record count remains exactly intact
    engine = create_engine(NEON_URL)
    with engine.connect() as conn:
        prod_users = conn.execute(text("SELECT count(*) FROM users")).scalar()
        prod_msgs = conn.execute(text("SELECT count(*) FROM messages")).scalar()
        print(f"\n[DATA INTEGRITY CHECK] Neon Production Users: {prod_users} (Expected: 287), Messages: {prod_msgs}")
        assert prod_users == 287, f"Expected 287 users, found {prod_users}"

    print("=" * 75)
    print("ALL LIVE VERCEL PRODUCTION PERFORMANCE CHECKS PASSED WITH 100% SUCCESS!")
    print("=" * 75)

if __name__ == "__main__":
    run_live_benchmark()
