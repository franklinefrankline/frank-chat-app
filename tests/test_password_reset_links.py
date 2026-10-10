import os
import sys
from pathlib import Path
from datetime import timedelta
from unittest.mock import patch

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from security import hash_password
from routes.auth import get_frontend_base_url, build_password_reset_url
from services.email_service import email_service

client = TestClient(app)

def test_password_reset_url_generation():
    print("\n--- TEST: Password Reset URL Generation ---")
    
    # 1. Localhost environment
    with patch.dict(os.environ, {"FRONTEND_URL": "http://localhost:8000", "VERCEL": ""}, clear=False):
        url = build_password_reset_url("testuser@example.com", "tok_abc_123")
        assert url == "http://localhost:8000/reset-password.html?email=testuser%40example.com&token=tok_abc_123"
        print("  [PASS] Localhost reset URL generated accurately:", url)

    # 2. Production Vercel environment
    with patch.dict(os.environ, {"FRONTEND_URL": "https://frank-chat-app.vercel.app", "VERCEL": "1"}, clear=False):
        url_prod = build_password_reset_url("user+plus@frank-test.com", "tok_xyz_789")
        assert url_prod == "https://frank-chat-app.vercel.app/reset-password.html?email=user%2Bplus%40frank-test.com&token=tok_xyz_789"
        print("  [PASS] Production reset URL generated accurately with encoded plus sign:", url_prod)

    # 3. Fallback when FRONTEND_URL is unset on Vercel
    with patch.dict(os.environ, {"FRONTEND_URL": "", "VERCEL": "1"}, clear=False):
        url_fallback = build_password_reset_url("admin@frank-chat.com", "sec_token_456")
        assert url_fallback == "https://frank-chat-app.vercel.app/reset-password.html?email=admin%40frank-chat.com&token=sec_token_456"
        print("  [PASS] Vercel fallback URL generated accurately:", url_fallback)

    # 4. Trailing slashes stripped and scheme guaranteed
    with patch.dict(os.environ, {"FRONTEND_URL": "frank-chat-app.vercel.app/", "VERCEL": "1"}, clear=False):
        url_clean = build_password_reset_url("user@domain.com", "tok_123")
        assert url_clean == "https://frank-chat-app.vercel.app/reset-password.html?email=user%40domain.com&token=tok_123"
        print("  [PASS] Missing scheme and trailing slashes normalized:", url_clean)

def test_email_template_links_match():
    print("\n--- TEST: Email Template Button and Link Match ---")
    reset_url = "https://frank-chat-app.vercel.app/reset-password.html?email=test%40example.com&token=tok_123"
    html = email_service._render_otp_html(
        title="Reset your FRANK Think Password",
        subtitle="Password Reset Request",
        otp_code="123456",
        instructions="Click the button below.",
        expires_in_minutes=15,
        action_button_label="Reset Password",
        action_button_url=reset_url
    )

    # Ensure action_button_url is present in both button and text link
    assert f'href="{reset_url}"' in html
    assert reset_url in html
    # Check button target="_blank"
    assert 'target="_blank"' in html
    print("  [PASS] Email template renders identical reset URL in button and fallback link.")

def test_direct_token_reset_flow():
    print("\n--- TEST: Direct Token Password Reset Flow ---")
    db = SessionLocal()
    email = "token_flow_user@frank-test.com"
    username = "token_flow_user"

    # Clean existing user if any
    db.query(models.User).filter(models.User.email == email).delete()
    db.commit()

    # Create user
    pw_hash = hash_password("InitialPassword123!")
    user = models.User(
        username=username,
        email=email,
        full_name="Token Flow User",
        name="Token Flow User",
        frank_id="TKN123",
        hashed_password=pw_hash,
        password_hash=pw_hash,
        is_active=True
    )
    db.add(user)
    db.commit()

    # 1. Request forgot-password
    with patch.object(email_service, 'is_configured', return_value=True), \
         patch.object(email_service, 'send_password_reset_otp', return_value=(True, "Delivered")):
        res = client.post("/api/auth/forgot-password", json={"email": email})
        assert res.status_code == 200, f"Forgot password failed: {res.status_code} {res.text}"

    # 2. Fetch reset token from DB
    otp_rec = db.query(models.OTPCode).filter(
        models.OTPCode.email == email,
        models.OTPCode.purpose == "password_reset",
        models.OTPCode.is_used == False
    ).order_by(models.OTPCode.id.desc()).first()
    assert otp_rec is not None
    token = otp_rec.token

    # 3. Validate token endpoint
    val_res = client.get(f"/api/auth/validate-reset-token?token={token}")
    assert val_res.status_code == 200
    assert val_res.json()["valid"] is True
    assert val_res.json()["email"] == email
    print("  [PASS] /api/auth/validate-reset-token successfully verified token.")

    # 4. Reset password using token
    new_pw = "NewSecretPassword2026!"
    reset_res = client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": new_pw
    })
    assert reset_res.status_code == 200
    assert reset_res.json()["success"] is True
    print("  [PASS] Password successfully updated via direct reset token.")

    # 5. Token cannot be reused (single-use check)
    reuse_res = client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": "AnotherNewPassword!"
    })
    assert reuse_res.status_code == 400
    print("  [PASS] Token single-use enforcement confirmed: second use rejected.")

    # 6. Validate token again should now fail as used
    val_used = client.get(f"/api/auth/validate-reset-token?token={token}")
    assert val_used.status_code == 400
    assert "already been used" in val_used.json()["detail"].lower()
    print("  [PASS] validate-reset-token accurately reports already-used token.")

    # 7. Old password no longer works
    login_old = client.post("/api/auth/login", json={"username": email, "password": "InitialPassword123!"})
    assert login_old.status_code == 401
    print("  [PASS] Old password rejected.")

    # 8. New password works
    login_new = client.post("/api/auth/login", json={"username": email, "password": new_pw})
    assert login_new.status_code == 200
    assert "access_token" in login_new.json()
    print("  [PASS] User successfully signed in using new password!")

    # Clean up test user
    db.query(models.OTPCode).filter(models.OTPCode.email == email).delete()
    db.query(models.User).filter(models.User.email == email).delete()
    db.commit()
    db.close()

def test_clean_routes():
    print("\n--- TEST: Clean Route Serving ---")
    res_clean = client.get("/reset-password")
    assert res_clean.status_code == 200
    assert "FRANK" in res_clean.text
    print("  [PASS] GET /reset-password served successfully.")

    res_html = client.get("/reset-password.html")
    assert res_html.status_code == 200
    assert "FRANK" in res_html.text
    print("  [PASS] GET /reset-password.html served successfully.")

if __name__ == "__main__":
    test_password_reset_url_generation()
    test_email_template_links_match()
    test_direct_token_reset_flow()
    test_clean_routes()
    print("\n>>> ALL PASSWORD RESET LINK TESTS PASSED! <<<\n")
