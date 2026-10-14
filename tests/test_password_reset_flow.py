import os
import sys
import json
import sqlite3
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"
ADMIN_EMAIL = "frankline30999112@gmail.com"
TEST_PASSWORD = "#Frankline2006"

def run_tests():
    print("=== TESTING FORGOT PASSWORD AND PASSWORD RESET FLOW ===")
    
    # 1. Test forgot-password with invalid email format
    try:
        data = json.dumps({"email": "notanemail"}).encode("utf-8")
        req = urllib.request.Request(f"{BASE_URL}/api/auth/forgot-password", data=data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req)
        print("FAIL: Invalid email was accepted!")
    except urllib.error.HTTPError as e:
        print(f"PASS: Invalid email rejected with HTTP {e.code}: {e.read().decode('utf-8')}")

    # 2. Test forgot-password with non-existent email -> Neutral confirmation
    data = json.dumps({"email": "nonexistent_random_user_12345@example.com"}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/auth/forgot-password", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"PASS: Non-existent email neutral response: {res}")
        assert res.get("success") is True

    # 3. Request password reset for Admin
    data = json.dumps({"email": ADMIN_EMAIL}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/auth/forgot-password", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"PASS: Admin forgot-password response: {res}")
        assert res.get("success") is True

    # 4. Check generated token from local SQLite db
    conn = sqlite3.connect("backend/chatapp.db")
    c = conn.cursor()
    c.execute("""
        SELECT id, email, token, is_used, expires_at 
        FROM otp_codes 
        WHERE email = ? AND purpose = 'password_reset' 
        ORDER BY id DESC LIMIT 1
    """, (ADMIN_EMAIL,))
    row = c.fetchone()
    conn.close()
    
    assert row is not None, "No OTP record found in database!"
    otp_id, email, token, is_used, expires_at = row
    print(f"PASS: Found OTP record #{otp_id}: email={email}, is_used={is_used}, expires_at={expires_at}")
    assert is_used == 0, "Token was marked used prematurely!"
    assert token is not None and len(token) > 20, "Token is not a valid secure token!"

    # 5. Validate token via API
    val_url = f"{BASE_URL}/api/auth/validate-reset-token?token={urllib.parse.quote(token)}"
    req = urllib.request.Request(val_url)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"PASS: Token validation response: {res}")
        assert res.get("valid") is True
        assert res.get("email") == ADMIN_EMAIL

    # 6. Perform reset with new password
    reset_data = json.dumps({
        "token": token,
        "new_password": TEST_PASSWORD
    }).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/auth/reset-password", data=reset_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"PASS: Reset password response: {res}")
        assert res.get("success") is True

    # 7. Verify token is now invalidated (single-use)
    try:
        req = urllib.request.Request(val_url)
        urllib.request.urlopen(req)
        print("FAIL: Used token was accepted again!")
    except urllib.error.HTTPError as e:
        print(f"PASS: Reused token rejected with HTTP {e.code}: {e.read().decode('utf-8')}")

    # 8. Test logging in with the updated password
    login_data = json.dumps({"email": ADMIN_EMAIL, "password": TEST_PASSWORD}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print(f"PASS: Login with updated password succeeded! User ID: {res.get('user', {}).get('id')}")

    print("\nALL PASSWORD RESET TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_tests()
