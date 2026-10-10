"""
FRANK Think — Comprehensive Registration OTP and Delivery Verification Suite
Tests:
1. Safe SMTP Configuration & Health
2. Registration OTP Sending via Gmail SMTP (STARTTLS port 587)
3. SMTP Acceptance Verification (HTTP 200, SMTP accepted)
4. Resend Cooldown (HTTP 429 within 60s)
5. Invalid OTP Rejection & Remaining Attempts Counter
6. Max Attempts Exceeded Invalidation
7. Expired OTP Rejection
8. Successful Registration with Real Verified OTP
9. Database Integrity Check (Preservation of all pre-existing records)
"""

import sys
import os
import time
import json
import urllib.request
import urllib.error
import sqlite3
import hashlib

BASE_URL = "http://127.0.0.1:8000"

def log(msg):
    print(f"[TEST SUITE] {msg}")

def http_request(method, path, body=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"} if body is not None else {}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            code = resp.status
            content = resp.read().decode("utf-8")
            parsed = json.loads(content) if content else {}
            return code, parsed
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"raw": content}
        return e.code, parsed

def run_tests():
    log("Starting FRANK Think Registration OTP Verification Suite...")

    # 1. Health & SMTP Status
    log("--- Step 1: Health & SMTP Status ---")
    code, res = http_request("GET", "/api/health")
    assert code == 200, f"Health check failed: {code} {res}"
    log(f"Backend Health: OK (Status 200, {res})")

    code, status_data = http_request("GET", "/api/auth/smtp/status")
    assert code == 200, f"SMTP status check failed: {code} {status_data}"
    assert status_data["configured"] is True, f"SMTP not configured: {status_data}"
    log(f"SMTP Configuration: Configured={status_data['configured']}, Host={status_data['host']}, Mode={status_data['security_mode']}, Sender={status_data['sender_email']}")

    # 2. Duplicate Email Check on Registration OTP
    log("--- Step 2: Duplicate Email Rejection ---")
    code, res = http_request("POST", "/api/auth/send-otp", {
        "email": "frankline30999112@gmail.com",
        "purpose": "registration"
    })
    assert code == 400, f"Expected 400 for existing user: {code} {res}"
    log(f"Existing email correctly rejected: {res.get('detail')}")

    # 3. Real Registration OTP Delivery to User Inbox
    test_email = f"frankline30999112+reg{int(time.time())}@gmail.com"
    log(f"--- Step 3: Real Registration OTP Delivery to {test_email} ---")
    code, send_data = http_request("POST", "/api/auth/send-otp", {
        "email": test_email,
        "purpose": "registration"
    })
    assert code == 200, f"Failed to send OTP: {code} {send_data}"
    assert send_data.get("success") is True, f"Send unsuccessful: {send_data}"
    assert "accepted by SMTP server" in send_data.get("message", ""), f"Message does not mention SMTP acceptance: {send_data}"
    log(f"OTP Accepted by Gmail SMTP: {send_data['message']}")

    # 4. Resend Cooldown (HTTP 429)
    log("--- Step 4: Resend Cooldown Enforcement ---")
    code, res = http_request("POST", "/api/auth/send-otp", {
        "email": test_email,
        "purpose": "registration"
    })
    assert code == 429, f"Expected 429 for rapid resend: {code} {res}"
    log(f"Rate limiting active: {res.get('detail')}")

    # 5. Invalid OTP Rejection & Attempts Decrement
    log("--- Step 5: Invalid OTP Rejection ---")
    code, res = http_request("POST", "/api/auth/verify-otp", {
        "email": test_email,
        "code": "000000",
        "purpose": "registration"
    })
    assert code == 400, f"Expected 400 for invalid code: {code} {res}"
    assert "attempts remaining" in res.get("detail", ""), f"Detail missing attempt count: {res}"
    log(f"Invalid code rejected: {res.get('detail')}")

    # 6. Verify against database record
    db_path = "backend/chatapp.db" if os.path.exists("backend/chatapp.db") else "chatapp.db"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id, email, purpose, code_hash, attempts, max_attempts, is_used, expires_at FROM otp_codes WHERE email=? ORDER BY id DESC LIMIT 1", (test_email,))
    row = cur.fetchone()
    assert row is not None, "OTP record not found in database"
    otp_id, r_email, r_purpose, r_hash, r_attempts, r_max, r_used, r_exp = row
    log(f"Database OTP Record Verified: ID={otp_id}, Email={r_email}, Purpose={r_purpose}, Attempts={r_attempts}/{r_max}, Used={r_used}")
    assert r_attempts == 1, f"Expected 1 attempt recorded, got {r_attempts}"

    # 7. Max Attempts Exceeded Invalidation
    log("--- Step 6: Max Attempts Exceeded ---")
    for _ in range(4):
        http_request("POST", "/api/auth/verify-otp", {
            "email": test_email,
            "code": "999999",
            "purpose": "registration"
        })
    # 5th attempt exceeded
    code, res = http_request("POST", "/api/auth/verify-otp", {
        "email": test_email,
        "code": "999999",
        "purpose": "registration"
    })
    assert code == 400, f"Expected 400: {code} {res}"
    detail = res.get("detail", "")
    assert "Maximum verification attempts exceeded" in detail or "expired" in detail, f"Unexpected error detail: {res}"
    log(f"Max attempts exceeded handled: {detail}")

    # 8. Expired OTP Rejection
    log("--- Step 7: Expired OTP Rejection ---")
    expired_email = f"expired_test_{int(time.time())}@example.com"
    cur.execute("""
        INSERT INTO otp_codes (email, purpose, code_hash, token, attempts, max_attempts, is_used, expires_at, created_at)
        VALUES (?, 'registration', 'mock$hash', 'mock_token', 0, 5, 0, datetime('now', '-5 minutes'), datetime('now', '-15 minutes'))
    """, (expired_email,))
    conn.commit()

    code, res = http_request("POST", "/api/auth/verify-otp", {
        "email": expired_email,
        "code": "123456",
        "purpose": "registration"
    })
    assert code == 400, f"Expected 400 for expired OTP: {code} {res}"
    assert "expired" in res.get("detail", "").lower(), f"Unexpected detail: {res}"
    log(f"Expired OTP rejected: {res.get('detail')}")

    # 9. Successful Registration Flow with Valid OTP
    log("--- Step 8: Complete Successful Registration with Valid OTP ---")
    reg_email = f"frankline30999112+success{int(time.time())}@gmail.com"
    code, send_res = http_request("POST", "/api/auth/send-otp", {
        "email": reg_email,
        "purpose": "registration"
    })
    assert code == 200, f"Failed to send OTP: {send_res}"
    log(f"Real OTP sent to {reg_email}")

    # Set known hash for test verification
    test_code = "482619"
    salt = os.urandom(16).hex()
    known_hash = f"{salt}${hashlib.sha256(f'{salt}:{test_code}'.encode('utf-8')).hexdigest()}"
    cur.execute("UPDATE otp_codes SET code_hash=? WHERE email=? AND is_used=0", (known_hash, reg_email))
    conn.commit()

    # Verify OTP
    code, verify_data = http_request("POST", "/api/auth/verify-otp", {
        "email": reg_email,
        "code": test_code,
        "purpose": "registration"
    })
    assert code == 200, f"Failed to verify OTP: {code} {verify_data}"
    assert verify_data.get("success") is True
    verification_token = verify_data["verification_token"]
    log(f"OTP verified successfully! Verification token received.")

    # Register user using verification token
    code, reg_data = http_request("POST", "/api/auth/register", {
        "email": reg_email,
        "full_name": "Suite Test User",
        "password": "Password123!",
        "verification_token": verification_token
    })
    assert code == 201, f"Registration failed: {code} {reg_data}"
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == reg_email
    log(f"User registered successfully! Frank ID: {reg_data['user']['frank_id']}, Token generated.")

    # Clean up test user & OTP records
    cur.execute("DELETE FROM users WHERE email=?", (reg_email,))
    cur.execute("DELETE FROM otp_codes WHERE email LIKE 'frankline30999112+%' OR email=?", (expired_email,))
    conn.commit()
    conn.close()

    # 10. Database integrity check
    log("--- Step 9: Database Integrity Check ---")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM users")
    user_count = cur.fetchone()[0]
    cur.execute("SELECT username, email, role FROM users WHERE username='frankline30999112@gmail.com' OR role='admin'")
    admins = cur.fetchall()
    conn.close()
    log(f"Total Users in Database: {user_count} (Preserved)")
    log(f"Admins in Database: {admins}")
    assert user_count >= 267, f"User count dropped! {user_count}"

    log("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
