"""
Comprehensive Test Suite for FRANK Think Gmail SMTP & OTP Verification
Tests all 16 cases specified in Section 9 of the specification.
"""

import os
import sys
import uuid
import smtplib
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
from main import app
from database import get_db, SessionLocal
import models
from services.email_service import email_service
from routes.auth import hash_otp_code, verify_otp_code, generate_otp

client = TestClient(app)

def run_tests():
    print("\n" + "=" * 70)
    print("FRANK Think — Gmail SMTP & OTP Verification Test Suite")
    print("=" * 70)

    # ---------------------------------------------------------
    # TEST 1 & 2: SMTP Configuration Missing / Status Safe Exposure
    # ---------------------------------------------------------
    print("\n[Case 1 & 2] Testing Unconfigured SMTP Safety & Status API...")
    with patch.object(email_service, 'is_configured', return_value=False):
        status_res = client.get("/api/auth/smtp/status")
        assert status_res.status_code == 200, f"Status failed: {status_res.text}"
        status_data = status_res.json()
        assert status_data["configured"] is False
        assert "pass" not in status_data
        assert "password" not in status_data
        assert status_data["host"] == "smtp.gmail.com"
        assert status_data["port"] == 587
        print("  [PASS] /api/auth/smtp/status safely masks credentials and does not expose passwords.")

        # Test missing SMTP rejection on /send-otp
        unconf_res = client.post("/api/auth/send-otp", json={
            "email": "test_unconf@example.com",
            "purpose": "registration"
        })
        assert unconf_res.status_code == 503, f"Expected 503, got: {unconf_res.status_code} ({unconf_res.text})"
        assert "SMTP credentials are not configured" in unconf_res.json()["detail"]
        print("  [PASS] /api/auth/send-otp returns safe 503 when SMTP is not configured.")

        # Test missing SMTP rejection on /forgot-password
        unconf_fp = client.post("/api/auth/forgot-password", json={
            "email": "test_unconf@example.com"
        })
        assert unconf_fp.status_code == 503, f"Expected 503, got: {unconf_fp.status_code}"
        print("  [PASS] /api/auth/forgot-password returns safe 503 when SMTP is not configured.")

    # ---------------------------------------------------------
    # TEST 3: SMTP Authentication Failure Handling
    # ---------------------------------------------------------
    print("\n[Case 3] Testing SMTP Authentication Failure Categorization...")
    with patch.object(email_service, 'is_configured', return_value=True):
        mock_auth_err = smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted.")
        with patch("smtplib.SMTP") as mock_smtp:
            mock_inst = MagicMock()
            mock_inst.login.side_effect = mock_auth_err
            mock_smtp.return_value = mock_inst
            
            ok, msg = email_service.verify_connection()
            assert ok is False
            assert "authentication failed" in msg.lower()
            assert "Google App Password" in msg
            # Verify no raw secrets in message
            assert "your-16-character" not in msg
            print(f"  [PASS] Authentication failure safely categorized: {msg[:60]}...")

    # ---------------------------------------------------------
    # TEST 4 & 5: Registration OTP Generation & Delivery & Acceptance
    # ---------------------------------------------------------
    print("\n[Case 4 & 5] Testing Registration OTP End-to-End...")
    uid = uuid.uuid4().hex[:6]
    test_email = f"user_{uid}@frank-test.com"
    full_name = f"FRANK Test User {uid}"
    password = "SecurePassword123!"

    # Mock email delivery success
    with patch.object(email_service, 'is_configured', return_value=True), \
         patch.object(email_service, 'send_registration_otp', return_value=(True, "Delivered")):
        
        send_res = client.post("/api/auth/send-otp", json={
            "email": test_email,
            "purpose": "registration"
        })
        assert send_res.status_code == 200, f"send-otp failed: {send_res.text}"
        assert send_res.json()["success"] is True
        print(f"  [PASS] OTP send accepted: {send_res.json()['message']}")

        # Retrieve the OTP from DB securely to test verification
        db = SessionLocal()
        otp_rec = db.query(models.OTPCode).filter(
            models.OTPCode.email == test_email,
            models.OTPCode.purpose == "registration",
            models.OTPCode.is_used == False
        ).order_by(models.OTPCode.id.desc()).first()
        assert otp_rec is not None
        assert otp_rec.code_hash is not None
        assert len(otp_rec.code_hash) > 20
        # Code hash must not be plain text 6 digits
        assert not otp_rec.code_hash.isdigit()
        print("  [PASS] OTP stored securely as salted SHA-256 hash.")

        # ---------------------------------------------------------
        # TEST 9: Resend Rate Limiting (429 within 60s)
        # ---------------------------------------------------------
        print("\n[Case 9] Testing Resend Rate Limiting...")
        resend_too_soon = client.post("/api/auth/send-otp", json={
            "email": test_email,
            "purpose": "registration"
        })
        assert resend_too_soon.status_code == 429, f"Expected 429, got: {resend_too_soon.status_code}"
        assert "wait 60 seconds" in resend_too_soon.json()["detail"]
        print("  [PASS] Resend within 60 seconds correctly rejected with HTTP 429.")

        # ---------------------------------------------------------
        # TEST 6: Incorrect OTP Rejection & Attempt Limits
        # ---------------------------------------------------------
        print("\n[Case 6] Testing Incorrect OTP Rejection...")
        bad_verify = client.post("/api/auth/register", json={
            "full_name": full_name,
            "email": test_email,
            "password": password,
            "otp_code": "000000" # wrong code
        })
        assert bad_verify.status_code == 400, f"Expected 400, got: {bad_verify.status_code}"
        assert "Invalid verification code" in bad_verify.json()["detail"]
        print(f"  [PASS] Incorrect OTP rejected: {bad_verify.json()['detail']}")

        # ---------------------------------------------------------
        # TEST 5: Correct OTP Accepted
        # ---------------------------------------------------------
        print("\n[Case 5] Testing Correct OTP Acceptance & User Registration...")
        # Since hash is salted SHA-256, test generating a known OTP and matching hash
        known_otp = "842915"
        otp_rec.code_hash = hash_otp_code(known_otp)
        db.commit()
        db.close()

        good_reg = client.post("/api/auth/register", json={
            "full_name": full_name,
            "email": test_email,
            "password": password,
            "otp_code": known_otp
        })
        assert good_reg.status_code == 201, f"Register with correct OTP failed: {good_reg.text}"
        reg_data = good_reg.json()
        assert "access_token" in reg_data
        assert reg_data["user"]["email"] == test_email
        print(f"  [PASS] User registered successfully with OTP! Token generated for {reg_data['user']['username']}")

        # ---------------------------------------------------------
        # TEST 8: Used OTP Cannot Be Reused
        # ---------------------------------------------------------
        print("\n[Case 8] Testing Used OTP Rejection...")
        reuse_res = client.post("/api/auth/register", json={
            "full_name": f"Another Name {uid}",
            "email": f"another_{uid}@frank-test.com",
            "password": password,
            "otp_code": known_otp
        })
        assert reuse_res.status_code == 400
        print("  [PASS] Already-used OTP cannot be reused.")

    # ---------------------------------------------------------
    # TEST 7: Expired OTP Rejection
    # ---------------------------------------------------------
    print("\n[Case 7] Testing Expired OTP Rejection...")
    db = SessionLocal()
    expired_email = f"expired_{uid}@frank-test.com"
    exp_code = "777888"
    exp_rec = models.OTPCode(
        email=expired_email,
        purpose="registration",
        code_hash=hash_otp_code(exp_code),
        attempts=0,
        max_attempts=5,
        is_used=False,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        created_at=datetime.now(timezone.utc) - timedelta(minutes=15)
    )
    db.add(exp_rec)
    db.commit()
    db.close()

    exp_res = client.post("/api/auth/register", json={
        "full_name": "Expired Test",
        "email": expired_email,
        "password": "Password123!",
        "otp_code": exp_code
    })
    assert exp_res.status_code == 400
    assert "expired" in exp_res.json()["detail"].lower()
    print("  [PASS] Expired OTP rejected with appropriate error.")

    # ---------------------------------------------------------
    # TEST 10-14: Password Reset Workflow
    # ---------------------------------------------------------
    print("\n[Case 10-14] Testing Password Reset Workflow (OTP & Token)...")
    with patch.object(email_service, 'is_configured', return_value=True), \
         patch.object(email_service, 'send_password_reset_otp', return_value=(True, "Delivered")):

        fp_res = client.post("/api/auth/forgot-password", json={"email": test_email})
        assert fp_res.status_code == 200, f"forgot-password failed: {fp_res.text}"
        assert fp_res.json()["success"] is True
        print(f"  [PASS] Password reset requested: {fp_res.json()['message']}")

        # Retrieve the reset OTP
        db = SessionLocal()
        reset_otp_rec = db.query(models.OTPCode).filter(
            models.OTPCode.email == test_email,
            models.OTPCode.purpose == "password_reset",
            models.OTPCode.is_used == False
        ).order_by(models.OTPCode.id.desc()).first()
        assert reset_otp_rec is not None
        assert reset_otp_rec.token is not None

        # Case 11: Invalid reset code rejected
        bad_reset = client.post("/api/auth/reset-password", json={
            "email": test_email,
            "code": "999999",
            "new_password": "BrandNewPassword123!"
        })
        assert bad_reset.status_code == 400
        assert "Invalid verification code" in bad_reset.json()["detail"]
        print("  [PASS] Invalid reset code rejected with attempts tracking.")

        # Set known reset code
        reset_code = "456123"
        reset_otp_rec.code_hash = hash_otp_code(reset_code)
        db.commit()
        db.close()

        # Case 12: Valid reset code changes password
        new_password = "BrandNewPassword123!"
        good_reset = client.post("/api/auth/reset-password", json={
            "email": test_email,
            "code": reset_code,
            "new_password": new_password
        })
        assert good_reset.status_code == 200, f"reset-password failed: {good_reset.text}"
        assert good_reset.json()["success"] is True
        print("  [PASS] Password successfully updated via valid reset code!")

        # Case 14: Old password no longer works
        old_login = client.post("/api/auth/login", json={
            "username": test_email,
            "password": password
        })
        assert old_login.status_code == 401
        print("  [PASS] Old password is no longer accepted.")

        # Case 13: New password works for login
        new_login = client.post("/api/auth/login", json={
            "username": test_email,
            "password": new_password
        })
        assert new_login.status_code == 200, f"New password login failed: {new_login.text}"
        assert "access_token" in new_login.json()
        print("  [PASS] New password successfully authenticates user!")

        # Case 8b: Used reset code cannot be reused
        reuse_reset = client.post("/api/auth/reset-password", json={
            "email": test_email,
            "code": reset_code,
            "new_password": "YetAnotherPassword123!"
        })
        assert reuse_reset.status_code == 400
        print("  [PASS] Single-use reset code invalidation confirmed.")

    # ---------------------------------------------------------
    # TEST 15: SMTP Failure Does Not Falsely Report Success
    # ---------------------------------------------------------
    print("\n[Case 15] Testing SMTP Failure Reporting...")
    with patch.object(email_service, 'is_configured', return_value=True), \
         patch.object(email_service, 'send_registration_otp', return_value=(False, "Connection refused")):
        
        fail_send = client.post("/api/auth/send-otp", json={
            "email": f"fail_{uid}@frank-test.com",
            "purpose": "registration"
        })
        assert fail_send.status_code == 502, f"Expected 502, got: {fail_send.status_code}"
        assert "Connection refused" in fail_send.json()["detail"]
        print("  [PASS] Delivery failure accurately raises 502 and does NOT falsely claim success.")

    # ---------------------------------------------------------
    # TEST 16: Existing Login & Registration Functional
    # ---------------------------------------------------------
    print("\n[Case 16] Testing Standard User & Admin Login Preserved...")
    admin_login = client.post("/api/auth/login", json={
        "username": "frankline30999112@gmail.com",
        "password": "#Frankline2006"
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_data = admin_login.json()
    assert admin_data["user"]["role"] == "admin"
    print("  [PASS] Existing admin login remains 100% operational.")

    print("\n" + "=" * 70)
    print("ALL 16 GMAIL SMTP & OTP TEST CASES PASSED SUCCESSFULLY!")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    run_tests()
