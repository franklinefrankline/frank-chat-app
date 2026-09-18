import time
import json
import urllib.request
import urllib.error
import random
import string

BASE_URL = "http://127.0.0.1:8000"

def random_str(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def do_req(endpoint, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{endpoint}"
    req_body = None
    if data is not None:
        req_body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = body
            return status, parsed
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = body
        return e.code, parsed

def run_tests():
    print("\n--- RUNNING FRANK DIRECT REGISTRATION TESTS ---")
    
    # Wait for server ready
    for i in range(10):
        try:
            status, resp = do_req("/api/health")
            if status == 200:
                print("Server is healthy!")
                break
        except Exception:
            time.sleep(1)
    else:
        print("Server not responding at", BASE_URL)
        return False

    suffix = random_str(6)
    test_email = f"direct_{suffix}@franktest.internal"
    test_username = f"user_{suffix}"
    test_password = "SecurePassword123!"
    test_fullname = f"Direct Tester {suffix}"

    print(f"\n1. Testing Registration: {test_email}")
    reg_payload = {
        "email": test_email,
        "username": test_username,
        "password": test_password,
        "full_name": test_fullname
    }
    status, reg_data = do_req("/api/auth/register", method="POST", data=reg_payload)
    print(f"Status: {status}, Response: {reg_data}")
    assert status == 201, f"Expected 201, got {status}"
    assert reg_data.get("success") is True, "Registration success should be True"
    assert "ready" in reg_data.get("message", "").lower() or "created" in reg_data.get("message", "").lower()
    assert len(reg_data.get("frank_id", "")) == 6, "Should return 6-character FRANK ID"
    print("[PASS] Registration succeeded without email verification!")

    print("\n2. Testing Direct Instant Login without email verification link")
    login_payload = {
        "username": test_email,
        "password": test_password
    }
    status, login_data = do_req("/api/auth/login", method="POST", data=login_payload)
    print(f"Status: {status}")
    assert status == 200, f"Expected 200 on direct login, got {status}"
    token = login_data["access_token"]
    user_info = login_data["user"]
    assert user_info["email_verified"] is True
    assert user_info["is_active"] is True
    print("[PASS] Direct instant login succeeded! Bearer token received.")

    print("\n3. Testing /api/auth/me with auth token")
    headers = {"Authorization": f"Bearer {token}"}
    status, me = do_req("/api/auth/me", headers=headers)
    assert status == 200
    assert me["username"] == test_username
    assert me["email"] == test_email
    assert len(me["frank_id"]) == 6
    print(f"[PASS] /api/auth/me verified for FRANK ID: {me['frank_id']}")

    print("\n4. Testing Duplicate Email Registration Prevention")
    status, _ = do_req("/api/auth/register", method="POST", data=reg_payload)
    assert status == 400
    print("[PASS] Duplicate registration cleanly rejected with 400.")

    print("\n5. Testing /api/auth/forgot-password honest unavailable message")
    status, fp_res = do_req("/api/auth/forgot-password", method="POST", data={"email": test_email})
    assert status == 200
    print("Forgot Password Response:", fp_res)
    assert "unavailable" in fp_res.get("message", "").lower()
    print("[PASS] Forgot password returns honest administrator contact message.")

    print("\n6. Testing /api/auth/verify-email endpoint removal")
    status, _ = do_req("/api/auth/verify-email?token=dummy")
    print(f"Status: {status}")
    assert status in (404, 405), f"Expected 404/405 for removed verify-email, got {status}"
    print("[PASS] /api/auth/verify-email endpoint is removed.")

    print("\n7. Testing /api/auth/resend-verification endpoint removal")
    status, _ = do_req("/api/auth/resend-verification", method="POST", data={"email": test_email})
    print(f"Status: {status}")
    assert status in (404, 405), f"Expected 404/405 for removed resend-verification, got {status}"
    print("[PASS] /api/auth/resend-verification endpoint is removed.")

    print("\n=======================================================")
    print("ALL 7 DIRECT REGISTRATION AND AUTH VERIFICATION TESTS PASSED! [SUCCESS]")
    print("=======================================================\n")
    return True

if __name__ == "__main__":
    success = run_tests()
    if not success:
        exit(1)
