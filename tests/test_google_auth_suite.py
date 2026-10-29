"""
Comprehensive Test Suite for Google Sign-In in FRANK Think
Tests OAuth 2.0 authorization URL generation, state validation, callback handling,
personal (@gmail.com) and Workspace (@domain.com) account support, account linking,
error scenarios, cancelled logins, and preservation of password authentication.
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from starlette.testclient import TestClient
import main
import models
from database import SessionLocal
from security import hash_password

client = TestClient(main.app)

class TestGoogleAuthSuite(unittest.TestCase):

    def setUp(self):
        client.cookies.clear()
        self.db = SessionLocal()
        # Clean up any test users created during test runs
        self.db.query(models.User).filter(
            models.User.email.in_([
                "personal.test.user@gmail.com",
                "workspace.pro@enterprise-org.com",
                "existing.user@gmail.com",
                "disabled.google.user@gmail.com"
            ])
        ).delete(synchronize_session=False)
        self.db.commit()

    def tearDown(self):
        client.cookies.clear()
        self.db.query(models.User).filter(
            models.User.email.in_([
                "personal.test.user@gmail.com",
                "workspace.pro@enterprise-org.com",
                "existing.user@gmail.com",
                "disabled.google.user@gmail.com"
            ])
        ).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    # -------------------------------------------------------------------------
    # 1. Unconfigured State Behavior (Clear Error Guidance)
    # -------------------------------------------------------------------------
    def test_google_status_unconfigured(self):
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}):
            r = client.get("/api/auth/google/status")
            self.assertEqual(r.status_code, 200)
            data = r.json()
            self.assertFalse(data["configured"])
            self.assertFalse(data["client_id_configured"])
            print("  [PASS] /api/auth/google/status reflects unconfigured state safely")

    def test_google_url_unconfigured_error(self):
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}):
            r = client.get("/api/auth/google/url")
            self.assertEqual(r.status_code, 503)
            self.assertIn("GOOGLE_CLIENT_ID", r.json()["detail"])
            print("  [PASS] /api/auth/google/url gives clear 503 error when unconfigured")

    def test_google_redirect_unconfigured_redirects_to_login_with_message(self):
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}):
            r = client.get("/api/auth/google", follow_redirects=False)
            self.assertIn(r.status_code, [307, 302])
            location = r.headers["location"]
            self.assertIn("oauth_error=not_configured", location)
            self.assertIn("login.html", location)
            print("  [PASS] /api/auth/google redirects cleanly to login page when unconfigured")

    # -------------------------------------------------------------------------
    # 2. Configured State & Authorization URL Generation
    # -------------------------------------------------------------------------
    def test_google_auth_url_generation(self):
        test_client_id = "test-client-id-12345.apps.googleusercontent.com"
        test_client_secret = "test-secret-67890"

        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": test_client_id,
            "GOOGLE_CLIENT_SECRET": test_client_secret,
            "FRONTEND_URL": "https://fnk.vercel.app"
        }):
            r = client.get("/api/auth/google/url")
            self.assertEqual(r.status_code, 200)
            data = r.json()
            self.assertTrue(data["configured"])
            self.assertIn("accounts.google.com/o/oauth2/v2/auth", data["url"])
            self.assertIn(f"client_id={test_client_id}", data["url"])
            self.assertIn("scope=openid+email+profile", data["url"])
            self.assertIn("state=", data["url"])
            self.assertIn("prompt=select_account", data["url"])
            # Verified state cookie is set
            self.assertIn("frank_oauth_state", r.cookies)
            print("  [PASS] /api/auth/google/url generates compliant OAuth URL with state cookie")

    # -------------------------------------------------------------------------
    # 3. Callback Handling: Cancellation & Error Cases
    # -------------------------------------------------------------------------
    def test_callback_cancelled_login(self):
        r = client.get("/api/auth/google/callback?error=access_denied&error_description=User+denied", follow_redirects=False)
        self.assertIn(r.status_code, [307, 302])
        location = r.headers["location"]
        self.assertIn("oauth_error=cancelled", location)
        self.assertIn("cancelled", location.lower())
        print("  [PASS] User cancellation handled cleanly with friendly message")

    def test_callback_missing_code(self):
        r = client.get("/api/auth/google/callback", follow_redirects=False)
        self.assertIn(r.status_code, [307, 302])
        location = r.headers["location"]
        self.assertIn("oauth_error=no_code", location)
        print("  [PASS] Missing authorization code handled with clear redirect")

    def test_callback_state_mismatch(self):
        # Set state cookie 'state_A', but send callback with 'state_B'
        r = client.get(
            "/api/auth/google/callback?code=mock_code&state=state_BBB_tampered",
            cookies={"frank_oauth_state": "state_AAA_correct"},
            follow_redirects=False
        )
        self.assertIn(r.status_code, [307, 302])
        location = r.headers["location"]
        self.assertIn("oauth_error=invalid_state", location)
        print("  [PASS] State parameter mismatch rejected with CSRF protection")

    # -------------------------------------------------------------------------
    # 4. Personal Google Account (@gmail.com) End-to-End Login
    # -------------------------------------------------------------------------
    def test_personal_google_account_login(self):
        test_email = "personal.test.user@gmail.com"
        test_sub = "google_sub_10001"
        test_name = "Personal Google User"
        test_state = "valid_secure_state_123"

        # Mock token exchange and userinfo responses from Google
        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {
            "access_token": "mock_google_access_token_abc",
            "token_type": "Bearer"
        }

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": test_sub,
            "email": test_email,
            "email_verified": True,
            "name": test_name,
            "picture": "https://lh3.googleusercontent.com/a/personal_avatar"
        }

        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": "test-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "FRONTEND_URL": "https://fnk.vercel.app"
        }):
            with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
                 patch("httpx.AsyncClient.get", return_value=mock_userinfo_resp):
                r = client.get(
                    f"/api/auth/google/callback?code=good_code&state={test_state}",
                    cookies={"frank_oauth_state": test_state},
                    follow_redirects=False
                )

        self.assertIn(r.status_code, [307, 302])
        location = r.headers["location"]
        self.assertIn("oauth_token=", location)
        self.assertNotIn("oauth_error", location)

        # Verify user was created in database
        db = SessionLocal()
        user = db.query(models.User).filter(models.User.email == test_email).first()
        self.assertIsNotNone(user, "User should be provisioned in database")
        self.assertEqual(user.oauth_provider, "google")
        self.assertEqual(user.oauth_id, test_sub)
        self.assertEqual(user.full_name, test_name)
        self.assertTrue(user.is_active)
        self.assertEqual(user.account_status, "active")
        self.assertIsNotNone(user.frank_id)
        db.close()
        print(f"  [PASS] Personal account ({test_email}) created and logged in with FRANK ID: {user.frank_id}")

    # -------------------------------------------------------------------------
    # 5. Google Workspace Account (@enterprise-org.com) End-to-End Login
    # -------------------------------------------------------------------------
    def test_workspace_google_account_login(self):
        test_email = "workspace.pro@enterprise-org.com"
        test_sub = "google_sub_workspace_20002"
        test_name = "Enterprise Workspace User"
        test_state = "valid_workspace_state_456"

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {
            "access_token": "mock_google_access_token_workspace",
            "token_type": "Bearer"
        }

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": test_sub,
            "email": test_email,
            "email_verified": True,
            "name": test_name,
            "hd": "enterprise-org.com",
            "picture": "https://lh3.googleusercontent.com/a/workspace_avatar"
        }

        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": "test-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "FRONTEND_URL": "https://fnk.vercel.app"
        }):
            with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
                 patch("httpx.AsyncClient.get", return_value=mock_userinfo_resp):
                r = client.get(
                    f"/api/auth/google/callback?code=workspace_code&state={test_state}",
                    cookies={"frank_oauth_state": test_state},
                    follow_redirects=False
                )

        self.assertIn(r.status_code, [307, 302])
        location = r.headers["location"]
        self.assertIn("oauth_token=", location)

        db = SessionLocal()
        user = db.query(models.User).filter(models.User.email == test_email).first()
        self.assertIsNotNone(user, "Workspace user should be provisioned in database")
        self.assertEqual(user.oauth_provider, "google")
        self.assertEqual(user.oauth_id, test_sub)
        self.assertEqual(user.full_name, test_name)
        db.close()
        print(f"  [PASS] Google Workspace account ({test_email}) logged in successfully")

    # -------------------------------------------------------------------------
    # 6. Account Linking with Existing Email/Password User
    # -------------------------------------------------------------------------
    def test_account_linking_existing_user(self):
        # Create an existing user with email and password
        db = SessionLocal()
        existing = models.User(
            username="existing_tester",
            email="existing.user@gmail.com",
            full_name="Existing User",
            name="Existing User",
            frank_id="EX9901",
            hashed_password=hash_password("ExistingPassword123!"),
            oauth_provider=None,
            oauth_id=None,
            role="user",
            account_status="active",
            is_active=True
        )
        db.add(existing)
        db.commit()
        db.close()

        test_state = "link_state_789"

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {"access_token": "token_linking"}

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": "linked_google_sub_33333",
            "email": "existing.user@gmail.com",
            "email_verified": True,
            "name": "Existing User",
            "picture": "https://lh3.googleusercontent.com/a/linked"
        }

        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test-id", "GOOGLE_CLIENT_SECRET": "test-secret"}):
            with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
                 patch("httpx.AsyncClient.get", return_value=mock_userinfo_resp):
                r = client.get(
                    f"/api/auth/google/callback?code=link_code&state={test_state}",
                    cookies={"frank_oauth_state": test_state},
                    follow_redirects=False
                )

        self.assertIn(r.status_code, [307, 302])
        self.assertIn("oauth_token=", r.headers["location"])

        # Verify existing user is updated and linked
        db = SessionLocal()
        updated_user = db.query(models.User).filter(models.User.email == "existing.user@gmail.com").first()
        self.assertEqual(updated_user.oauth_provider, "google")
        self.assertEqual(updated_user.oauth_id, "linked_google_sub_33333")
        self.assertEqual(updated_user.frank_id, "EX9901")  # Preserved original ID
        db.close()
        print("  [PASS] Existing account linked seamlessly to Google identity")

    # -------------------------------------------------------------------------
    # 7. Disabled Account Rejection
    # -------------------------------------------------------------------------
    def test_disabled_account_rejected(self):
        db = SessionLocal()
        disabled_user = models.User(
            username="disabled_google_tester",
            email="disabled.google.user@gmail.com",
            full_name="Disabled User",
            name="Disabled User",
            frank_id="DIS001",
            hashed_password=hash_password("DisabledPassword123!"),
            oauth_provider="google",
            oauth_id="disabled_sub_44444",
            role="user",
            account_status="disabled",
            is_active=False
        )
        db.add(disabled_user)
        db.commit()
        db.close()

        test_state = "disabled_state_000"

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {"access_token": "token_dis"}

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": "disabled_sub_44444",
            "email": "disabled.google.user@gmail.com",
            "email_verified": True,
            "name": "Disabled User"
        }

        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test-id", "GOOGLE_CLIENT_SECRET": "test-secret"}):
            with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
                 patch("httpx.AsyncClient.get", return_value=mock_userinfo_resp):
                r = client.get(
                    f"/api/auth/google/callback?code=dis_code&state={test_state}",
                    cookies={"frank_oauth_state": test_state},
                    follow_redirects=False
                )

        self.assertIn(r.status_code, [307, 302])
        location = r.headers["location"]
        self.assertIn("oauth_error=auth_failed", location)
        print("  [PASS] Disabled user login rejected with auth_failed error code")

    # -------------------------------------------------------------------------
    # 8. Direct Token Endpoint (Mobile / One-Tap)
    # -------------------------------------------------------------------------
    def test_google_token_login_endpoint(self):
        test_email = "personal.test.user@gmail.com"
        mock_info_resp = MagicMock()
        mock_info_resp.status_code = 200
        mock_info_resp.json.return_value = {
            "sub": "sub_direct_token_55555",
            "email": test_email,
            "email_verified": "true",
            "name": "Direct Token User",
            "aud": "test-client-id"
        }

        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test-client-id"}):
            with patch("httpx.AsyncClient.get", return_value=mock_info_resp):
                r = client.post("/api/auth/google/token", json={"id_token": "valid_mock_id_token"})

        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("access_token", data)
        self.assertIn("username", data["user"])
        print("  [PASS] /api/auth/google/token directly authenticates valid Google ID token")

    def test_google_token_login_invalid(self):
        mock_err_resp = MagicMock()
        mock_err_resp.status_code = 400

        with patch("httpx.AsyncClient.get", return_value=mock_err_resp):
            r = client.post("/api/auth/google/token", json={"id_token": "bad_token"})
        self.assertEqual(r.status_code, 401)
        print("  [PASS] /api/auth/google/token rejects invalid token with 401")

    # -------------------------------------------------------------------------
    # 9. Domain Filtering Configuration
    # -------------------------------------------------------------------------
    def test_allowed_domains_filtering(self):
        test_state = "filter_state_123"
        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {"access_token": "token_abc"}

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": "sub_unauthorized_domain",
            "email": "user@unauthorized.com",
            "email_verified": True,
            "name": "Unauthorized User"
        }

        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": "test-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "GOOGLE_ALLOWED_DOMAINS": "trustedcorp.com,gmail.com"
        }):
            with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
                 patch("httpx.AsyncClient.get", return_value=mock_userinfo_resp):
                r = client.get(
                    f"/api/auth/google/callback?code=code_filter&state={test_state}",
                    cookies={"frank_oauth_state": test_state},
                    follow_redirects=False
                )

        self.assertIn(r.status_code, [307, 302])
        location = r.headers["location"]
        self.assertIn("oauth_error=auth_failed", location)
        self.assertIn("not%20authorized", location.lower())
        print("  [PASS] Domain whitelist correctly filters out unauthorized domains")

    # -------------------------------------------------------------------------
    # 10. Preservation of Existing Authentication Methods
    # -------------------------------------------------------------------------
    def test_email_password_login_preservation(self):
        # Admin user frankline30999112@gmail.com
        r = client.post("/api/auth/login", json={
            "email": "frankline30999112@gmail.com",
            "password": "#Frankline2006"
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "admin")
        print("  [PASS] Email/password login remains 100% operational")

    # -------------------------------------------------------------------------
    # 11. Callback Route 404 Prevention & Alias Verification
    # -------------------------------------------------------------------------
    def test_callback_no_code_graceful_redirect(self):
        """Verifies that direct hits to /api/auth/google/callback return a 307 redirect, never 404"""
        r = client.get("/api/auth/google/callback", follow_redirects=False)
        self.assertIn(r.status_code, [307, 302])
        self.assertIn("oauth_error=no_code", r.headers.get("location", ""))
        print("  [PASS] Callback without code redirects gracefully (no 404)")

    def test_callback_alias_route(self):
        """Verifies that /api/auth/callback/google alias route resolves correctly"""
        r = client.get("/api/auth/callback/google", follow_redirects=False)
        self.assertIn(r.status_code, [307, 302])
        self.assertIn("oauth_error=no_code", r.headers.get("location", ""))
        print("  [PASS] Callback alias route /api/auth/callback/google resolves correctly")

    def test_callback_post_method(self):
        """Verifies POST method handling on callback route"""
        r = client.post("/api/auth/google/callback", follow_redirects=False)
        self.assertIn(r.status_code, [307, 302])
        self.assertIn("oauth_error=no_code", r.headers.get("location", ""))
        print("  [PASS] Callback POST method resolves correctly")

if __name__ == "__main__":
    print("=== Running Google OAuth 2.0 Integration Test Suite ===")
    unittest.main()
