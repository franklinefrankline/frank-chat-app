import sys
import os
import uuid
import hashlib
from pathlib import Path
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

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


def run_email_verification_tests():
    print("==================================================")
    print("RUNNING FRANK EMAIL VERIFICATION & RESEND TEST SUITE")
    print("==================================================")

    database.check_and_migrate_db()
    db = database.SessionLocal()

    created_users = []
    created_tokens = []

    try:
        # 1. REGISTRATION CREATES UNVERIFIED USER & 6-CHAR FRANK ID
        uid = uuid.uuid4().hex[:8]
        test_email = f"user_{uid}@example.com"
        test_password = "SecurePassword123!"

        reg_in = schemas.UserRegister(
            username=f"frank_{uid}",
            email=test_email.upper(),  # Test normalization
            full_name="Verification Tester",
            password=test_password
        )

        mock_req = MagicMock()
        mock_req.client.host = "127.0.0.1"

        reg_resp = auth_module.register(reg_in, request=mock_req, db=db)
        user_id = reg_resp.get("user_id") or db.query(models.User).filter_by(username=reg_in.username).first().id
        created_users.append(user_id)

        db_user = db.query(models.User).filter_by(id=user_id).first()
        assert db_user is not None
        assert db_user.email == test_email.lower(), "User email must be normalized to lowercase"
        assert db_user.email_verified is False, "New account must be created as UNVERIFIED (email_verified=False)"
        assert len(db_user.frank_id) == 6, "Permanent FRANK ID must be 6 characters"
        assert db_user.frank_id.isalnum() and db_user.frank_id.isupper(), "FRANK ID must be uppercase alphanumeric"
        print(f"[PASS] 1. Registered unverified user '{db_user.username}' (FRANK ID: {db_user.frank_id}, email_verified=False)")

        # 2. DUPLICATE EMAIL REGISTRATION REJECTED
        dup_caught = False
        try:
            auth_module.register(reg_in, request=mock_req, db=db)
        except HTTPException as e:
            if e.status_code == 400 and "already registered" in e.detail.lower():
                dup_caught = True
        assert dup_caught is True, "Duplicate email registration must be rejected with 400"
        print("[PASS] 2. Duplicate email registration safely rejected")

        # 3. VERIFICATION TOKEN STORED AS SHA-256 HASH WITH 24-HOUR EXPIRATION
        token_record = db.query(models.EmailVerificationToken).filter(
            models.EmailVerificationToken.user_id == db_user.id
        ).order_by(models.EmailVerificationToken.id.desc()).first()

        assert token_record is not None, "EmailVerificationToken must be created in DB upon registration"
        created_tokens.append(token_record.id)
        assert token_record.used is False, "Token must be initially unused"
        assert len(token_record.token_hash) == 64, "Token hash must be a 64-char SHA-256 hex string"

        now_utc = datetime.now(timezone.utc)
        rec_expires = token_record.expires_at
        if rec_expires.tzinfo is None:
            rec_expires = rec_expires.replace(tzinfo=timezone.utc)
        diff_hours = (rec_expires - now_utc).total_seconds() / 3600
        assert 23.5 <= diff_hours <= 24.5, f"Verification token must expire in ~24 hours, got {diff_hours} hours"
        print(f"[PASS] 3. Verification token stored as SHA-256 hash with 24-hour expiry (Hash: {token_record.token_hash[:16]}...)")

        # 4. LOGIN UNVERIFIED BLOCKED (HTTP 403)
        login_blocked = False
        try:
            auth_module.login(schemas.UserLogin(username=db_user.username, password=test_password), db=db)
        except HTTPException as e:
            if e.status_code == 403 and "verify your email" in e.detail.lower():
                login_blocked = True
        assert login_blocked is True, "Unverified account login must be blocked with HTTP 403"
        print("[PASS] 4. Login blocked for unverified account (HTTP 403 'Please verify your email')")

        # 5. INVALID VERIFICATION TOKEN REJECTED
        invalid_caught = False
        try:
            auth_module.verify_email("fake_token_xyz_123456", db=db)
        except HTTPException as e:
            if e.status_code == 400:
                invalid_caught = True
        assert invalid_caught is True, "Invalid verification token must return HTTP 400"
        print("[PASS] 5. Invalid verification token rejected with HTTP 400")

        # 6. EXPIRED VERIFICATION TOKEN REJECTED
        expired_raw = "expired_test_token_999"
        expired_hash = hashlib.sha256(expired_raw.encode("utf-8")).hexdigest()
        expired_rec = models.EmailVerificationToken(
            user_id=db_user.id,
            token_hash=expired_hash,
            expires_at=datetime.now(timezone.utc) - timedelta(hours=2),  # 2 hours ago
            used=False
        )
        db.add(expired_rec)
        db.commit()
        db.refresh(expired_rec)
        created_tokens.append(expired_rec.id)

        expired_caught = False
        try:
            auth_module.verify_email(expired_raw, db=db)
        except HTTPException as e:
            if e.status_code == 400 and "expired" in e.detail.lower():
                expired_caught = True
        assert expired_caught is True, "Expired verification token must return HTTP 400"
        print("[PASS] 6. Expired verification token rejected with clear expiration message")

        # 7. SUCCESSFUL EMAIL VERIFICATION
        active_raw = "active_test_raw_token_555"
        active_hash = hashlib.sha256(active_raw.encode("utf-8")).hexdigest()
        active_rec = models.EmailVerificationToken(
            user_id=db_user.id,
            token_hash=active_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            used=False
        )
        db.add(active_rec)
        db.commit()
        db.refresh(active_rec)
        created_tokens.append(active_rec.id)

        verif_res = auth_module.verify_email(active_raw, db=db)
        assert verif_res["success"] is True
        assert "verified successfully" in verif_res["message"].lower()

        db.refresh(db_user)
        db.refresh(active_rec)
        assert db_user.email_verified is True, "User account must be marked email_verified = True"
        assert active_rec.used is True, "Verification token must be marked used = True"
        print("[PASS] 7. Successful email verification: user marked email_verified=True, token marked used=True")

        # 8. ONE-TIME TOKEN REUSE PREVENTED
        reuse_caught = False
        try:
            auth_module.verify_email(active_raw, db=db)
        except HTTPException as e:
            if e.status_code == 400 and "already been used" in e.detail.lower():
                reuse_caught = True
        assert reuse_caught is True, "Reusing a verification token must be rejected"
        print("[PASS] 8. One-time token use enforced (reuse attempt blocked)")

        # 9. LOGIN SUCCEEDS AFTER VERIFICATION
        login_res = auth_module.login(schemas.UserLogin(username=db_user.username, password=test_password), db=db)
        assert login_res.access_token is not None
        assert login_res.user.email_verified is True
        print(f"[PASS] 9. Login succeeded for verified user '{login_res.user.username}' (JWT issued)")

        # 10. RESEND VERIFICATION FOR UNVERIFIED USER & OLD TOKEN INVALIDATION
        uid2 = uuid.uuid4().hex[:8]
        test_email2 = f"unverified_{uid2}@example.com"
        reg_in2 = schemas.UserRegister(
            username=f"unverif_{uid2}",
            email=test_email2,
            full_name="Unverified User",
            password="Password456!"
        )
        auth_module.register(reg_in2, request=mock_req, db=db)
        user2 = db.query(models.User).filter_by(username=reg_in2.username).first()
        created_users.append(user2.id)

        token1 = db.query(models.EmailVerificationToken).filter_by(user_id=user2.id, used=False).first()
        assert token1 is not None
        created_tokens.append(token1.id)

        # Trigger resend verification
        resend_req = schemas.ResendVerificationRequest(email=test_email2)
        resend_resp = auth_module.resend_verification(resend_req, request=mock_req, db=db)
        assert "message" in resend_resp

        db.refresh(token1)
        assert token1.used is True, "Old verification token must be invalidated (used=True) when new one is requested"

        token2 = db.query(models.EmailVerificationToken).filter(
            models.EmailVerificationToken.user_id == user2.id,
            models.EmailVerificationToken.used == False
        ).order_by(models.EmailVerificationToken.id.desc()).first()
        assert token2 is not None
        assert token2.id != token1.id, "A new distinct token record must be generated"
        created_tokens.append(token2.id)
        print("[PASS] 10. Resend verification generated new token and invalidated previous token")

        # 11. EMAIL TEMPLATE BRANDING & CONTENTS
        sample_url = "https://frank-chat-app.vercel.app/verify-email?token=test_token_abc"
        html = email_service.build_verification_email_html(sample_url, user_name="Alex")
        text = email_service.build_verification_email_text(sample_url, user_name="Alex")

        assert "FRANK" in html and "THINK" in html, "HTML email must contain FRANK and THINK branding"
        assert sample_url in html, "HTML email must contain the verification link"
        assert "24 hours" in html, "HTML email must state 24 hours expiration"
        assert "#050817" in html, "HTML email must use FRANK deep navy palette"
        assert sample_url in text, "Plain-text fallback must contain the verification link"
        assert "QENVO" not in html and "QENVO" not in text, "Brand leak: QENVO found in email template"
        print("[PASS] 11. Transactional email templates verified (FRANK / Think / 24-hour expiry / Navy palette)")

        # 12. DATABASE MIGRATION INTEGRITY
        # Verify that running check_and_migrate_db multiple times is completely idempotent and safe
        database.check_and_migrate_db()
        print("[PASS] 12. Database migration idempotency confirmed (no errors on re-run)")

        print("==================================================")
        print("ALL 12 EMAIL VERIFICATION TESTS PASSED! [SUCCESS]")
        print("==================================================")

    finally:
        for tid in created_tokens:
            db.query(models.EmailVerificationToken).filter(models.EmailVerificationToken.id == tid).delete()
        for uid_item in created_users:
            db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == uid_item).delete()
            db.query(models.EmailVerificationToken).filter(models.EmailVerificationToken.user_id == uid_item).delete()
            db.query(models.User).filter(models.User.id == uid_item).delete()
        db.commit()
        db.close()


if __name__ == "__main__":
    run_email_verification_tests()
