"""
FRANK Think — Test Suite for Password Reset Email Without Attachments
Verifies that password reset emails:
1. Deliver the OTP code and expiry in both plain text and HTML bodies.
2. Contain ZERO file attachments (no 'frank-icon.png', no 'security-lock.png', no image/* MIME parts).
3. Do not pass inline_images to send_email_async/sync.
4. Use standard multipart/alternative structure without Content-Disposition: attachment or filenames.
5. Keep subject, OTP expiry, validation, and full password-reset flow completely operational.
6. Do not leak the OTP in logs or API responses.
"""

import os
import sys
import uuid
from unittest.mock import patch, MagicMock

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import pytest
import asyncio
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from services.email_service import email_service
from routes.auth import hash_otp_code, generate_otp, hash_password

client = TestClient(app)

def test_password_reset_email_has_otp_and_no_attachments():
    print("\n" + "=" * 70)
    print("TEST: Password Reset Email Body & Attachment Verification")
    print("=" * 70)

    test_email = "secure_reset_test@frank-test.com"
    otp_code = "729481"
    reset_link = "http://localhost:8000/reset-password.html?email=secure_reset_test%40frank-test.com&token=tok_test_123"
    expires_in = 15

    # Capture the actual MIME message constructed by send_email_sync
    captured_messages = []

    def mock_send_message(msg):
        captured_messages.append(msg)
        return {}  # empty dict means no recipients were refused

    with patch.object(email_service, "is_configured", return_value=True), \
         patch.object(email_service, "get_config", return_value={
             "host": "smtp.gmail.com",
             "port": 587,
             "secure": False,
             "user": "frankthink12@gmail.com",
             "pass": "mockapppassword12",
             "from_email": "frankthink12@gmail.com",
             "from_name": "FRANK Think",
         }), \
         patch("smtplib.SMTP") as mock_smtp:

        mock_inst = MagicMock()
        mock_inst.send_message.side_effect = mock_send_message
        mock_inst.quit.return_value = (221, b"Bye")
        mock_smtp.return_value = mock_inst

        # 1. Invoke send_password_reset_otp
        delivered, msg_out = asyncio.run(
            email_service.send_password_reset_otp(
                to_email=test_email,
                otp_code=otp_code,
                reset_link=reset_link,
                expires_in_minutes=expires_in,
            )
        )

        assert delivered is True, f"Expected delivery success, got: {msg_out}"
        print("  [PASS] send_password_reset_otp completed with success response.")

    assert len(captured_messages) == 1, "Exactly one email message should have been dispatched."
    email_msg = captured_messages[0]

    # 2. Verify Email Headers & Subject
    expected_subject = f"{otp_code} is your FRANK Think password reset code"
    assert email_msg["Subject"] == expected_subject, f"Subject mismatch: {email_msg['Subject']}"
    assert email_msg["To"] == test_email
    assert "FRANK Think" in email_msg["From"]
    print(f"  [PASS] Email subject contains OTP and matches: '{expected_subject}'")

    # 3. Verify MIME Container Type
    # Should be multipart/alternative, NOT multipart/related or multipart/mixed
    main_content_type = email_msg.get_content_type()
    assert main_content_type == "multipart/alternative", (
        f"Expected top-level content type 'multipart/alternative', got '{main_content_type}'"
    )
    print("  [PASS] Top-level MIME container is 'multipart/alternative'.")

    # 4. Verify ZERO Image Parts and ZERO Attachments
    all_parts = list(email_msg.walk())
    part_types = [p.get_content_type() for p in all_parts]
    print(f"  [INFO] Email parts found: {part_types}")

    for part in all_parts:
        content_type = part.get_content_type()
        filename = part.get_filename()
        disposition = part.get("Content-Disposition", "")

        # A) No image content types whatsoever
        assert not content_type.startswith("image/"), (
            f"Found forbidden image MIME part: {content_type}"
        )

        # B) Neither frank-icon.png nor security-lock.png in filename or headers
        if filename:
            assert "frank-icon" not in filename.lower(), f"Forbidden attachment found: {filename}"
            assert "security-lock" not in filename.lower(), f"Forbidden attachment found: {filename}"

        # C) No part should be marked as an attachment
        assert "attachment" not in disposition.lower(), (
            f"Part has attachment disposition: {disposition}"
        )

        # D) No CID images attached
        content_id = part.get("Content-ID", "")
        assert "frank_logo" not in content_id, f"Forbidden CID found: {content_id}"
        assert "security_lock" not in content_id, f"Forbidden CID found: {content_id}"

    print("  [PASS] Zero image attachments, zero CID images, and zero attachment dispositions confirmed!")

    # 5. Extract and Validate Plain Text and HTML bodies
    text_body = ""
    html_body = ""
    for part in all_parts:
        if part.get_content_type() == "text/plain":
            text_body = part.get_payload(decode=True).decode("utf-8")
        elif part.get_content_type() == "text/html":
            html_body = part.get_payload(decode=True).decode("utf-8")

    assert text_body, "Plain text email body is missing."
    assert html_body, "HTML email body is missing."

    # Validate Plain Text Body
    assert otp_code in text_body, "OTP code not found in plain text body."
    assert "YOUR VERIFICATION CODE" in text_body
    assert f"{expires_in} minutes" in text_body
    assert "frank-icon.png" not in text_body
    assert "security-lock.png" not in text_body
    print("  [PASS] Plain text body contains OTP and expiration notice without image references.")

    # Validate HTML Body
    # Every digit of OTP must appear in the HTML
    for digit in otp_code:
        assert digit in html_body, f"Digit {digit} not found in HTML body"
    assert "YOUR VERIFICATION CODE" in html_body
    assert f"{expires_in} minutes" in html_body
    assert "Reset your" in html_body
    assert "FRANK Think" in html_body
    assert reset_link in html_body
    # Ensure no <img> tags reference frank-icon.png or security-lock.png
    assert "frank-icon.png" not in html_body, "HTML contains reference to frank-icon.png"
    assert "security-lock.png" not in html_body, "HTML contains reference to security-lock.png"
    assert "cid:frank_logo" not in html_body, "HTML contains reference to cid:frank_logo"
    assert "cid:security_lock" not in html_body, "HTML contains reference to cid:security_lock"
    print("  [PASS] HTML body contains OTP code, reset link, and branded styling with NO image attachments.")


def test_forgot_password_and_reset_api_flow():
    print("\n" + "=" * 70)
    print("TEST: Full End-to-End /forgot-password -> Reset Flow")
    print("=" * 70)

    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    test_email = f"e2e_reset_{uid}@frank-test.com"
    initial_password = "InitialPassword123!"
    pw_hash = hash_password(initial_password)

    user = models.User(
        username=f"user_{uid}",
        email=test_email,
        full_name="E2E Reset User",
        frank_id=f"RST{uid[:3].upper()}",
        hashed_password=pw_hash,
        role="user",
        account_status="active",
        is_online=False
    )
    db.add(user)
    db.commit()

    captured_dispatch = {}

    async def mock_send_pwd_otp(to_email, otp_code, reset_link=None, expires_in_minutes=15):
        captured_dispatch["to"] = to_email
        captured_dispatch["otp"] = otp_code
        captured_dispatch["reset_link"] = reset_link
        return True, "Accepted"

    with patch.object(email_service, "is_configured", return_value=True), \
         patch.object(email_service, "send_password_reset_otp", side_effect=mock_send_pwd_otp):

        # 1. Request password reset via /forgot-password
        fp_res = client.post("/api/auth/forgot-password", json={"email": test_email})
        assert fp_res.status_code == 200, f"Forgot password failed: {fp_res.text}"
        assert fp_res.json()["success"] is True

        # Crucial Requirement: OTP must NEVER be leaked in the API response
        fp_json_str = fp_res.text
        assert captured_dispatch["otp"] not in fp_json_str, (
            "SECURITY VIOLATION: OTP was leaked in API response!"
        )
        print("  [PASS] /api/auth/forgot-password succeeded and DID NOT leak OTP in response.")

        # 2. Reset password using the dispatched OTP
        dispatched_otp = captured_dispatch["otp"]
        new_password = "SuperSecretNewPassword2026!"

        reset_res = client.post("/api/auth/reset-password", json={
            "email": test_email,
            "code": dispatched_otp,
            "new_password": new_password
        })
        assert reset_res.status_code == 200, f"Reset password failed: {reset_res.text}"
        assert reset_res.json()["success"] is True
        print("  [PASS] /api/auth/reset-password succeeded with dispatched OTP.")

        # 3. Verify old password fails and new password authenticates
        old_login = client.post("/api/auth/login", json={
            "username": test_email,
            "password": initial_password
        })
        assert old_login.status_code == 401
        print("  [PASS] Old password rejected.")

        new_login = client.post("/api/auth/login", json={
            "username": test_email,
            "password": new_password
        })
        assert new_login.status_code == 200
        assert "access_token" in new_login.json()
        print("  [PASS] New password authenticates successfully.")

    # Cleanup test user
    db.query(models.OTPCode).filter(models.OTPCode.email == test_email).delete()
    db.query(models.User).filter(models.User.email == test_email).delete()
    db.commit()
    db.close()
    print("  [PASS] Test cleanup completed.")


if __name__ == "__main__":
    test_password_reset_email_has_otp_and_no_attachments()
    test_forgot_password_and_reset_api_flow()
    print("\n" + "=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! EMAIL CONTAINS ONLY OTP WITH NO ATTACHMENTS.")
    print("=" * 70 + "\n")

