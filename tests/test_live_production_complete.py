import os
import sys
import json
import ssl
import pg8000.native
import urllib.request
import urllib.error

PROD_URL = "https://frank-chat-app.vercel.app"
ADMIN_EMAIL = "frankline30999112@gmail.com"
ADMIN_PW = "#Frankline2006"

def run_production_tests():
    print("================================================================")
    print("LIVE PRODUCTION POST-DEPLOYMENT VERIFICATION")
    print(f"Target URL: {PROD_URL}")
    print("================================================================")

    # 1. Health check
    req = urllib.request.Request(f"{PROD_URL}/health")
    with urllib.request.urlopen(req) as resp:
        health = json.loads(resp.read().decode("utf-8"))
        print(f"1. [PASS] Live Production /health: {health}")
        assert resp.status == 200
        assert health.get("status") == "ok"
        assert health.get("database") == "connected"

    # 2. Verify database connection directly in Neon PostgreSQL
    ssl_context = ssl.create_default_context()
    conn = pg8000.native.Connection(
        user="neondb_owner",
        password="npg_8kgYbEIv9cAj",
        host="ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech",
        port=5432,
        database="neondb",
        ssl_context=ssl_context
    )
    users = conn.run("SELECT id, username, email, role, is_active FROM users")
    print(f"2. [PASS] Live Database direct user count: {len(users)}")
    assert len(users) == 1, f"Expected 1 user in production, found {len(users)}"
    assert users[0][0] == 1
    assert users[0][2] == ADMIN_EMAIL
    assert users[0][3] == "admin"
    assert users[0][4] is True
    print(f"   Administrator verified in Neon DB: ID={users[0][0]}, Email={users[0][2]}, Role={users[0][3]}")
    
    # Check preserved documents in Neon
    docs = conn.run("SELECT id, original_filename, uploader_id FROM documents")
    print(f"   Preserved admin documents in Neon DB: {len(docs)}")
    assert len(docs) == 4
    conn.close()

    # 3. Test public registration rejection on Live Production
    try:
        reg_data = json.dumps({"email": "test_public_user@example.com", "password": "Password123!", "full_name": "Test User"}).encode("utf-8")
        req = urllib.request.Request(f"{PROD_URL}/api/auth/register", data=reg_data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req)
        assert False, "Registration was not rejected in production!"
    except urllib.error.HTTPError as e:
        print(f"3. [PASS] Live Production registration rejected: HTTP {e.code} {e.read().decode('utf-8')}")
        assert e.code == 403

    # 4. Test registration OTP rejection on Live Production
    try:
        otp_data = json.dumps({"email": "test_public_user@example.com", "purpose": "registration"}).encode("utf-8")
        req = urllib.request.Request(f"{PROD_URL}/api/auth/send-otp", data=otp_data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req)
        assert False, "Registration OTP was not rejected in production!"
    except urllib.error.HTTPError as e:
        print(f"4. [PASS] Live Production registration OTP rejected: HTTP {e.code} {e.read().decode('utf-8')}")
        assert e.code == 403

    # 5. Test Live Production Admin Login
    login_data = json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PW}).encode("utf-8")
    req = urllib.request.Request(f"{PROD_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        token = res["access_token"]
        user = res["user"]
        print(f"5. [PASS] Live Production Admin Login: User ID={user['id']}, Email={user['email']}, Role={user['role']}")
        assert user["id"] == 1
        assert user["role"] == "admin"

    # 6. Test Live Production /api/admin/metrics
    req = urllib.request.Request(f"{PROD_URL}/api/admin/metrics", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        metrics = json.loads(resp.read().decode("utf-8"))
        print(f"6. [PASS] Live Production Admin Metrics: {metrics}")
        assert metrics["total_users"] == 1
        assert metrics["active_accounts"] == 1

    # 7. Test Live Production /api/conversations
    req = urllib.request.Request(f"{PROD_URL}/api/conversations", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        convs = json.loads(resp.read().decode("utf-8"))
        print(f"7. [PASS] Live Production Conversations: {len(convs)} conversation(s)")
        assert len(convs) <= 1
        if len(convs) == 1:
            assert "(You)" in convs[0]["name"]

    # 8. Test Live Production /api/files (Admin documents)
    req = urllib.request.Request(f"{PROD_URL}/api/files", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        files = json.loads(resp.read().decode("utf-8"))
        print(f"8. [PASS] Live Production Preserved Documents: {len(files)} files returned")
        assert len(files) == 4

    # 9. Test Live Production SMTP verification
    req = urllib.request.Request(f"{PROD_URL}/api/auth/smtp/verify", data=b"{}", headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        smtp_res = json.loads(resp.read().decode("utf-8"))
        print(f"9. [PASS] Live Production SMTP status: {smtp_res.get('message')}")
        assert smtp_res.get("success") is True

    # 10. Live Production Forgot Password and Link Generation Test
    print("\n--- 10. Live Production Forgot Password Workflow ---")
    fp_data = json.dumps({"email": ADMIN_EMAIL}).encode("utf-8")
    req = urllib.request.Request(f"{PROD_URL}/api/auth/forgot-password", data=fp_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        fp_res = json.loads(resp.read().decode("utf-8"))
        print(f"   Forgot-password response: {fp_res}")
        assert fp_res.get("success") is True

    # Check the created OTP record in Neon DB
    conn = pg8000.native.Connection(
        user="neondb_owner",
        password="npg_8kgYbEIv9cAj",
        host="ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech",
        port=5432,
        database="neondb",
        ssl_context=ssl_context
    )
    otp_rows = conn.run(f"SELECT id, email, token, is_used, expires_at FROM otp_codes WHERE email = '{ADMIN_EMAIL}' AND purpose = 'password_reset' ORDER BY id DESC LIMIT 1")
    conn.close()
    
    assert len(otp_rows) > 0, "No OTP record found in Neon DB!"
    otp_id, email, token_val, is_used, expires_at = otp_rows[0]
    print(f"   Neon DB OTP Record #{otp_id}: token={token_val[:12]}..., is_used={is_used}, expires_at={expires_at}")
    assert is_used is False

    # 11. Validate reset token on Live Production
    val_url = f"{PROD_URL}/api/auth/validate-reset-token?token={urllib.parse.quote(token_val)}"
    req = urllib.request.Request(val_url)
    with urllib.request.urlopen(req) as resp:
        val_res = json.loads(resp.read().decode("utf-8"))
        print(f"11. [PASS] Live Production Token Validation: {val_res}")
        assert val_res.get("valid") is True
        assert val_res.get("email") == ADMIN_EMAIL

    # 12. Reset password on Live Production
    reset_payload = json.dumps({
        "token": token_val,
        "new_password": ADMIN_PW
    }).encode("utf-8")
    req = urllib.request.Request(f"{PROD_URL}/api/auth/reset-password", data=reset_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        reset_res = json.loads(resp.read().decode("utf-8"))
        print(f"12. [PASS] Live Production Password Reset: {reset_res}")
        assert reset_res.get("success") is True

    # 13. Verify single-use token invalidation on Live Production
    try:
        req = urllib.request.Request(val_url)
        urllib.request.urlopen(req)
        assert False, "Used token was accepted again on Live Production!"
    except urllib.error.HTTPError as e:
        print(f"13. [PASS] Live Production Reused Token Rejection: HTTP {e.code} {e.read().decode('utf-8')}")
        assert e.code == 400

    # 14. Verify Login with new password on Live Production
    req = urllib.request.Request(f"{PROD_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"14. [PASS] Live Production Login after reset: User ID={res['user']['id']}, Email={res['user']['email']}")
        assert res["user"]["id"] == 1

    print("\n================================================================")
    print("ALL 14 LIVE PRODUCTION E2E VERIFICATIONS PASSED (100% SUCCESS)!")
    print("================================================================")

if __name__ == "__main__":
    run_production_tests()
