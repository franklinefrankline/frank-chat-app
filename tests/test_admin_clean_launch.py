import os
import sys
import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"
ADMIN_EMAIL = "frankline30999112@gmail.com"
ADMIN_PW = "#Frankline2006"

def make_req(endpoint, data=None, token=None, method=None):
    url = f"{BASE_URL}{endpoint}"
    payload = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    return urllib.request.urlopen(req)

def run():
    print("==================================================")
    print("FRANK THINK — ADMIN-ONLY CLEAN LAUNCH REGRESSION")
    print("==================================================")

    # 1. Health check
    resp = make_req("/health")
    assert resp.status == 200
    health_data = json.loads(resp.read().decode("utf-8"))
    assert health_data.get("status") == "ok"
    print("1. [PASS] Health check OK: database connected.")

    # 2. Registration blocked
    try:
        make_req("/api/auth/register", {"email": "intruder@example.com", "password": "Password123!", "full_name": "Intruder"})
        assert False, "Registration was not blocked!"
    except urllib.error.HTTPError as e:
        assert e.code == 403
        print(f"2. [PASS] Public registration blocked server-side: HTTP {e.code}")

    # 3. Registration OTP blocked
    try:
        make_req("/api/auth/send-otp", {"email": "intruder@example.com", "purpose": "registration"})
        assert False, "Registration OTP was not blocked!"
    except urllib.error.HTTPError as e:
        assert e.code == 403
        print(f"3. [PASS] Registration OTP blocked server-side: HTTP {e.code}")

    # 4. Admin Login
    resp = make_req("/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert resp.status == 200
    login_data = json.loads(resp.read().decode("utf-8"))
    token = login_data["access_token"]
    user = login_data["user"]
    assert user["id"] == 1
    assert user["role"] == "admin"
    print(f"4. [PASS] Admin authentication successful: ID={user['id']}, Role={user['role']}")

    # 5. Protected /api/auth/me
    resp = make_req("/api/auth/me", token=token)
    assert resp.status == 200
    me = json.loads(resp.read().decode("utf-8"))
    assert me["id"] == 1
    print("5. [PASS] Protected endpoint /api/auth/me verified.")

    # 6. Admin Metrics
    resp = make_req("/api/admin/metrics", token=token)
    assert resp.status == 200
    metrics = json.loads(resp.read().decode("utf-8"))
    print(f"6. [PASS] Admin metrics loaded: {metrics}")
    assert metrics["total_users"] == 1, f"Expected 1 total user, got {metrics['total_users']}"

    # 7. Admin Users List
    resp = make_req("/api/admin/users?page=1&limit=10", token=token)
    assert resp.status == 200
    users_data = json.loads(resp.read().decode("utf-8"))
    users = users_data.get("users", [])
    print(f"7. [PASS] Admin users list loaded: {len(users)} user(s) returned.")
    assert len(users) == 1
    assert users[0]["id"] == 1
    assert users[0]["email"] == ADMIN_EMAIL

    # 8. Clean Conversations
    resp = make_req("/api/conversations", token=token)
    assert resp.status == 200
    convs = json.loads(resp.read().decode("utf-8"))
    print(f"8. [PASS] Conversations loaded cleanly: {len(convs)} conversation(s) returned.")
    assert len(convs) <= 1, f"Expected at most 1 conversation (self-chat), got {len(convs)}"
    if len(convs) == 1:
        assert "(You)" in convs[0]["name"], f"Expected self conversation, got {convs[0]['name']}"

    # 9. Admin Preserved Documents
    resp = make_req("/api/files", token=token)
    assert resp.status == 200
    docs = json.loads(resp.read().decode("utf-8"))
    print(f"9. [PASS] Admin documents loaded: {len(docs)} document(s) preserved.")
    assert len(docs) == 4, f"Expected 4 preserved documents, got {len(docs)}"

    # 10. SMTP Verify
    resp = make_req("/api/auth/smtp/verify", {}, token=token)
    assert resp.status == 200
    smtp_res = json.loads(resp.read().decode("utf-8"))
    assert smtp_res.get("success") is True
    print(f"10. [PASS] SMTP verified with Gmail: {smtp_res.get('message')}")

    print("\n==================================================")
    print("ALL 10 CLEAN LAUNCH REGRESSION CHECKS PASSED (100%)")
    print("==================================================")

if __name__ == "__main__":
    run()
