import httpx
import psycopg
import time

PROD_URL = "https://frank-chat-app.vercel.app"
NEON_URL = "postgresql://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"

def run_live_test():
    print("=" * 70)
    print("TESTING LIVE PRODUCTION PASSWORD RESET FLOW (https://frank-chat-app.vercel.app)")
    print("=" * 70)

    client = httpx.Client(timeout=30.0)

    # 1. Check live health
    h_res = client.get(f"{PROD_URL}/api/health")
    assert h_res.status_code == 200, f"Health check failed: {h_res.text}"
    print(f"[PASS] Live Backend Health: {h_res.json()}")

    # 2. Check SMTP status
    smtp_res = client.get(f"{PROD_URL}/api/auth/smtp/status")
    assert smtp_res.status_code == 200
    assert smtp_res.json()["configured"] is True
    print(f"[PASS] Live SMTP Configured: {smtp_res.json()['sender_name']} via {smtp_res.json()['host']}")

    # 3. Create or prepare a verified test user in Neon DB directly
    conn = psycopg.connect(NEON_URL)
    cur = conn.cursor()

    test_email = "prod_reset_test@frank-test.com"
    test_user = "prod_reset_tester"
    initial_pass = "InitialPass2026!"

    cur.execute("DELETE FROM otp_codes WHERE lower(email)=%s", (test_email,))
    cur.execute("DELETE FROM users WHERE lower(email)=%s OR username=%s", (test_email, test_user))
    conn.commit()

    # Import hash_password locally
    import sys
    sys.path.insert(0, "backend")
    from security import hash_password
    from datetime import datetime, timezone
    now_ts = datetime.now(timezone.utc)
    pw_hash = hash_password(initial_pass)

    cur.execute("""
        INSERT INTO users (username, email, full_name, name, frank_id, hashed_password, password_hash, avatar_url, theme, language, status, role, account_status, is_active, is_online, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, '', 'light', 'en', 'active', 'user', 'active', True, False, %s, %s) RETURNING id
    """, (test_user, test_email, "Prod Reset Tester", "Prod Reset Tester", "PRD999", pw_hash, pw_hash, now_ts, now_ts))
    user_id = cur.fetchone()[0]
    conn.commit()
    print(f"[PASS] Prepared test user in Neon Production DB: id={user_id}, email={test_email}")

    # Verify initial login works on live production
    login1 = client.post(f"{PROD_URL}/api/auth/login", json={"username": test_email, "password": initial_pass})
    assert login1.status_code == 200, f"Initial login failed: {login1.text}"
    print("[PASS] Initial credentials verified on live production API.")

    # 4. Request password reset via forgot-password on live production
    print("Requesting password reset from live production API...")
    fp_res = client.post(f"{PROD_URL}/api/auth/forgot-password", json={"email": test_email})
    assert fp_res.status_code == 200, f"Forgot password failed: {fp_res.text}"
    print(f"[PASS] Live forgot-password response: {fp_res.json()['message']}")

    # 5. Query OTP record generated in Neon production DB
    cur.execute("""
        SELECT token, code_hash, is_used, expires_at 
        FROM otp_codes 
        WHERE lower(email)=%s AND purpose='password_reset'
        ORDER BY id DESC LIMIT 1
    """, (test_email,))
    row = cur.fetchone()
    assert row is not None, "No OTP record created in Neon DB!"
    token, code_hash, is_used, expires_at = row
    assert not is_used, "Token was marked as used unexpectedly!"
    print(f"[PASS] OTP token safely generated in Neon DB: token length={len(token)}, expires_at={expires_at}")

    # 6. Test GET /api/auth/validate-reset-token with live production API
    val_res = client.get(f"{PROD_URL}/api/auth/validate-reset-token", params={"token": token})
    assert val_res.status_code == 200, f"Token validation failed: {val_res.text}"
    val_data = val_res.json()
    assert val_data["valid"] is True
    assert val_data["email"].lower() == test_email
    print(f"[PASS] Live validate-reset-token confirmed valid: {val_data}")

    # 7. Test invalid token on live production
    bad_val = client.get(f"{PROD_URL}/api/auth/validate-reset-token", params={"token": "completely_fake_token_999"})
    assert bad_val.status_code == 400
    print(f"[PASS] Live validate-reset-token correctly rejected invalid token with HTTP 400.")

    # 8. Reset password using live production POST /api/auth/reset-password
    new_password = "BrandNewLiveProdPass2026!#"
    reset_res = client.post(f"{PROD_URL}/api/auth/reset-password", json={
        "token": token,
        "new_password": new_password
    })
    assert reset_res.status_code == 200, f"Reset password failed: {reset_res.text}"
    print(f"[PASS] Live reset-password succeeded: {reset_res.json()['message']}")

    # 9. Verify single-use token enforcement on live production
    reuse_res = client.post(f"{PROD_URL}/api/auth/reset-password", json={
        "token": token,
        "new_password": "YetAnotherPass!"
    })
    assert reuse_res.status_code == 400
    print(f"[PASS] Live token reuse correctly rejected with HTTP 400: {reuse_res.json()['detail']}")

    # 10. Verify validate-reset-token on used token
    used_val = client.get(f"{PROD_URL}/api/auth/validate-reset-token", params={"token": token})
    assert used_val.status_code == 400
    assert "already been used" in used_val.json()["detail"].lower()
    print(f"[PASS] Live validate-reset-token reports already used: {used_val.json()['detail']}")

    # 11. Verify old password no longer authenticates on live production
    old_login = client.post(f"{PROD_URL}/api/auth/login", json={"username": test_email, "password": initial_pass})
    assert old_login.status_code == 401
    print("[PASS] Old password correctly rejected on live production.")

    # 12. Verify new password successfully logs in on live production
    new_login = client.post(f"{PROD_URL}/api/auth/login", json={"username": test_email, "password": new_password})
    assert new_login.status_code == 200, f"New login failed: {new_login.text}"
    token_data = new_login.json()
    assert "access_token" in token_data
    print(f"[PASS] New password successfully authenticated user on live production! User: {token_data['user']['username']}")

    # Clean up test user
    cur.execute("DELETE FROM otp_codes WHERE lower(email)=%s", (test_email,))
    cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
    conn.commit()
    conn.close()

    print("\n" + "=" * 70)
    print("ALL 12 LIVE PRODUCTION VERIFICATION CHECKS PASSED WITH 100% SUCCESS!")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    run_live_test()
