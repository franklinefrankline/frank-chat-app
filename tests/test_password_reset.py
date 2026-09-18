import sys
import os
import uuid
import hashlib
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))
os.environ["DATABASE_URL"] = f"sqlite:///{str(backend_dir / 'chatapp.db').replace('\\', '/')}"

import database
import models
import schemas
import security
from routes import auth as auth_module
from services import email as email_service
from fastapi import HTTPException
from unittest.mock import MagicMock

def run_password_reset_tests():
    print("==================================================")
    print("RUNNING FRANK PASSWORD RESET & RESEND TEST SUITE")
    print("==================================================")

    database.check_and_migrate_db()
    db = database.SessionLocal()

    created_users = []
    created_tokens = []

    try:
        # 1. SETUP: Create Test User
        uid = uuid.uuid4().hex[:8]
        test_email = f"berline_{uid}@example.com"
        initial_pwd = "OriginalSecurePassword123!"

        reg_in = schemas.UserRegister(
            username=f"berline_{uid}",
            email=test_email.upper(),  # Test email normalization
            full_name="Berline Operator",
            password=initial_pwd
        )
        reg_resp = auth_module.register(reg_in, db=db)
        user = db.query(models.User).filter(models.User.email == test_email.lower()).first()
        created_users.append(user.id)
        # Mark email verified for password reset test user so login tests proceed
        user.email_verified = True
        db.commit()
        db.refresh(user)
        assert user.email == test_email.lower(), "User email must be normalized to lowercase"
        print(f"[PASS] 1. Created test user '{user.username}' with normalized email '{user.email}'")

        # 2. EMAIL ENUMERATION PROTECTION (NON-EXISTENT USER)
        fake_req = schemas.ForgotPasswordRequest(email="nonexistent_ghost@example.com")
        mock_req = MagicMock()
        mock_req.client.host = "127.0.0.1"

        res_fake = auth_module.forgot_password(fake_req, request=mock_req, db=db)
        assert "message" in res_fake
        assert "debug_token" not in res_fake, "Security violation: debug_token must not be returned"
        assert res_fake["message"] == "If an account exists with this email, password reset instructions have been sent."
        print("[PASS] 2. Email enumeration protection verified (non-existent email returns generic message)")

        # 3. FORGOT PASSWORD (REAL REGISTERED USER)
        real_req = schemas.ForgotPasswordRequest(email=test_email)
        res_real = auth_module.forgot_password(real_req, request=mock_req, db=db)
        assert res_real["message"] == res_fake["message"], "Existent and non-existent email responses must be identical"
        assert "debug_token" not in res_real

        # Find the created token record in DB
        token_record = db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id
        ).order_by(models.PasswordResetToken.id.desc()).first()

        assert token_record is not None, "PasswordResetToken record must be created in DB"
        created_tokens.append(token_record.id)
        assert token_record.used is False, "New token must not be marked used"
        assert len(token_record.token_hash) == 64, "Token hash must be a 64-char SHA-256 hex string"
        
        # Verify 30-minute expiration window
        now_utc = datetime.now(timezone.utc)
        rec_expires = token_record.expires_at
        if rec_expires.tzinfo is None:
            rec_expires = rec_expires.replace(tzinfo=timezone.utc)
        diff_minutes = (rec_expires - now_utc).total_seconds() / 60
        assert 28 <= diff_minutes <= 31, f"Token must expire in ~30 minutes, got {diff_minutes} mins"
        print(f"[PASS] 3. Reset token created with 30-min expiry (Hash: {token_record.token_hash[:16]}...)")

        # 4. MULTIPLE RESET REQUESTS INVALIDATION
        # When user requests reset again, the previous token must be invalidated
        res_second = auth_module.forgot_password(real_req, request=mock_req, db=db)
        db.refresh(token_record)
        assert token_record.used is True, "Previous reset token must be invalidated (used=True) on new request"

        # Get the second token record
        second_token_record = db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used == False
        ).order_by(models.PasswordResetToken.id.desc()).first()

        assert second_token_record is not None
        assert second_token_record.id != token_record.id
        created_tokens.append(second_token_record.id)
        print("[PASS] 4. Multiple reset requests handled safely (previous token invalidated)")

        # 5. TOKEN VERIFICATION ENDPOINT
        # Simulate a valid raw token
        raw_test_token = "secure_test_token_abc_123_xyz_789"
        raw_test_hash = hashlib.sha256(raw_test_token.encode("utf-8")).hexdigest()

        active_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=raw_test_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            used=False
        )
        db.add(active_token)
        db.commit()
        db.refresh(active_token)
        created_tokens.append(active_token.id)

        # Verify active token
        verify_res = auth_module.verify_reset_token(raw_test_token, db=db)
        assert verify_res["valid"] is True
        print("[PASS] 5. Active token verification succeeded (valid=True)")

        # Verify non-existent token
        invalid_caught = False
        try:
            auth_module.verify_reset_token("non_existent_token_12345", db=db)
        except HTTPException as e:
            if e.status_code == 400 and "Invalid or expired" in e.detail:
                invalid_caught = True
        assert invalid_caught is True, "Invalid token must be rejected with 400"
        print("[PASS] 6. Invalid token properly rejected with 400")

        # 6. EXPIRED TOKEN REJECTION
        expired_raw = "expired_raw_token_xyz"
        expired_hash = hashlib.sha256(expired_raw.encode("utf-8")).hexdigest()
        expired_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=expired_hash,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),  # 5 mins in the past
            used=False
        )
        db.add(expired_token)
        db.commit()
        db.refresh(expired_token)
        created_tokens.append(expired_token.id)

        expired_caught = False
        try:
            auth_module.verify_reset_token(expired_raw, db=db)
        except HTTPException as e:
            if e.status_code == 400 and "expired" in e.detail.lower():
                expired_caught = True
        assert expired_caught is True, "Expired token must be rejected"
        print("[PASS] 7. Expired token rejected with clear expiration message")

        # 7. PASSWORD LENGTH VALIDATION (MIN 8 CHARACTERS)
        short_pwd_caught = False
        try:
            schemas.ResetPasswordRequest(token=raw_test_token, new_password="short")
        except Exception as e:
            if "at least 8 characters" in str(e) or "string_too_short" in str(e):
                short_pwd_caught = True
        assert short_pwd_caught is True, "Password under 8 characters must be rejected by validation"
        print("[PASS] 8. Password minimum 8-character validation enforced (Pydantic schema level)")

        # 8. SUCCESSFUL PASSWORD RESET EXECUTION
        new_valid_pwd = "BrandNewSecurePassword2026!"
        old_hashed = user.hashed_password

        reset_exec_res = auth_module.reset_password(
            schemas.ResetPasswordRequest(token=raw_test_token, new_password=new_valid_pwd),
            db=db
        )
        assert reset_exec_res["success"] is True
        assert "password reset successfully" in reset_exec_res["message"].lower()

        # Verify DB changes
        db.refresh(user)
        db.refresh(active_token)
        assert user.hashed_password != old_hashed, "User hashed_password must be updated in DB"
        assert active_token.used is True, "Token must be marked used=True upon password update"
        print("[PASS] 9. Password reset executed successfully: DB password updated, token marked used")

        # 9. ONE-TIME TOKEN REUSE PREVENTION
        reuse_caught = False
        try:
            auth_module.reset_password(
                schemas.ResetPasswordRequest(token=raw_test_token, new_password="AnotherNewPassword123!"),
                db=db
            )
        except HTTPException as e:
            if e.status_code == 400 and ("already been used" in e.detail or "invalid" in e.detail):
                reuse_caught = True
        assert reuse_caught is True, "Used token must NEVER be reusable"
        print("[PASS] 10. One-time token use enforced (reuse attempt blocked)")

        # 10. LOGIN AUTHENTICATION WITH NEW VS OLD PASSWORD
        # Old password must fail
        login_fail = False
        try:
            auth_module.login(schemas.UserLogin(username=user.username, password=initial_pwd), db=db)
        except HTTPException as e:
            if e.status_code == 401:
                login_fail = True
        assert login_fail is True, "Old password must fail to login"

        # New password must succeed
        login_token = auth_module.login(schemas.UserLogin(username=user.username, password=new_valid_pwd), db=db)
        assert login_token.access_token is not None, "Login with new password must succeed"
        print("[PASS] 11. End-to-end authentication verified: New password logs in, old password fails")

        # 11. EMAIL TEMPLATE & BRANDING VERIFICATION
        sample_url = "https://frank-chat-app.vercel.app/reset-password?token=test_token_123"
        html = email_service.build_reset_email_html(sample_url, user_name="Berline")
        text = email_service.build_reset_email_text(sample_url, user_name="Berline")

        assert "FRANK" in html and "THINK" in html, "HTML email must contain FRANK branding and THINK tagline"
        assert sample_url in html, "HTML email must include the reset URL"
        assert "#050817" in html, "HTML email must use FRANK deep navy palette"
        assert "30 minutes" in html, "HTML email must state 30 minute expiry"
        assert sample_url in text, "Plain-text fallback must include the reset URL"
        assert "QENVO" not in html and "QENVO" not in text, "Brand leak: QENVO found in email template"
        print("[PASS] 12. Transactional email HTML and plain-text templates verified (FRANK / Think / 30-min)")

        print("==================================================")
        print("ALL 12 PASSWORD RESET & RESEND TESTS PASSED! [SUCCESS]")
        print("==================================================")

    finally:
        for tid in created_tokens:
            db.query(models.PasswordResetToken).filter(models.PasswordResetToken.id == tid).delete()
        for uid_item in created_users:
            db.query(models.User).filter(models.User.id == uid_item).delete()
        db.commit()
        db.close()

if __name__ == "__main__":
    run_password_reset_tests()
