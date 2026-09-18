import urllib.request
import urllib.parse
import json

BASE_URL = "http://127.0.0.1:8000"

def get(path, headers=None):
    req = urllib.request.Request(f"{BASE_URL}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')

def main():
    print("==================================================")
    print("TESTING LIVE FRANK HTTP ENDPOINTS & ROUTING")
    print("==================================================")

    # 1. Health check
    status, body = get("/api/health")
    assert status == 200, f"Health check failed: {status}"
    print("[PASS] 1. /api/health returned 200 OK")

    # 2. HTML serving routes
    status, body = get("/admin-login")
    assert status == 200 and "FRANK Admin Portal" in body, f"Failed /admin-login: {status}"
    print("[PASS] 2. /admin-login served with FRANK Admin Portal content")

    status, body = get("/admin")
    assert status == 200 and "Overview & Metrics" in body, f"Failed /admin: {status}"
    print("[PASS] 3. /admin served with Overview & Metrics content")

    status, body = get("/settings")
    assert status == 200 and "Danger Zone" in body, f"Failed /settings: {status}"
    print("[PASS] 4. /settings served with Account & Danger Zone section")

    # 3. Admin security enforcement (Unauthorized requests rejected)
    status, body = get("/api/admin/stats")
    assert status == 401, f"Expected 401 Unauthorized for unauthenticated admin stats, got {status}"
    print("[PASS] 5. /api/admin/stats correctly protected with 401 Unauthorized")

    status, body = get("/api/admin/users")
    assert status == 401, f"Expected 401 Unauthorized for unauthenticated admin users, got {status}"
    print("[PASS] 6. /api/admin/users correctly protected with 401 Unauthorized")

    status, body = get("/api/admin/audit-logs")
    assert status == 401, f"Expected 401 Unauthorized for unauthenticated audit logs, got {status}"
    print("[PASS] 7. /api/admin/audit-logs correctly protected with 401 Unauthorized")

    print("==================================================")
    print("ALL LIVE ROUTING & ENDPOINT CHECKS PASSED (7/7)")
    print("==================================================")

if __name__ == "__main__":
    main()
