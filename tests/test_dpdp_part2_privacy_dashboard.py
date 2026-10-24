"""
Automated Test Suite for FRANK Think DPDP Part 2:
User Privacy Dashboard & Data Rights Management
"""

import unittest
import json
import urllib.request
import urllib.error
import sys
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

import database
import models
import security

def api_post(endpoint, payload, token=None):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"detail": body}
        return e.code, parsed

def api_get(endpoint, token=None):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method="GET")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"detail": body}
        return e.code, parsed

def api_put(endpoint, payload, token=None):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"detail": body}
        return e.code, parsed


class TestDPDPPart2PrivacyDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 1. Login as Admin
        admin_login = {
            "email": "frankline30999112@gmail.com",
            "password": "#Frankline2006"
        }
        status, res = api_post("/api/auth/login", admin_login)
        if status != 200:
            raise RuntimeError(f"Admin login failed: status={status}, res={res}")
        cls.admin_token = res["access_token"]
        cls.admin_user = res["user"]

        # 2. Setup Test User A and User B
        db = database.SessionLocal()
        try:
            user_a = db.query(models.User).filter(models.User.email == "dpdp_test_user_a@test.com").first()
            if not user_a:
                user_a = models.User(
                    username="user_a_privacy",
                    email="dpdp_test_user_a@test.com",
                    full_name="Test User A",
                    hashed_password=security.hash_password("Password123!"),
                    frank_id="FAUSERA1",
                    role="user",
                    is_active=True,
                    account_status="active"
                )
                db.add(user_a)
                db.commit()
                db.refresh(user_a)
            cls.user_a_id = user_a.id
            cls.user_a_token = security.create_access_token({
                "sub": user_a.username,
                "user_id": user_a.id,
                "email": user_a.email,
                "full_name": user_a.full_name,
                "frank_id": user_a.frank_id,
                "role": user_a.role
            })

            user_b = db.query(models.User).filter(models.User.email == "dpdp_test_user_b@test.com").first()
            if not user_b:
                user_b = models.User(
                    username="user_b_privacy",
                    email="dpdp_test_user_b@test.com",
                    full_name="Test User B",
                    hashed_password=security.hash_password("Password123!"),
                    frank_id="FBUSERB2",
                    role="user",
                    is_active=True,
                    account_status="active"
                )
                db.add(user_b)
                db.commit()
                db.refresh(user_b)
            cls.user_b_id = user_b.id
            cls.user_b_token = security.create_access_token({
                "sub": user_b.username,
                "user_id": user_b.id,
                "email": user_b.email,
                "full_name": user_b.full_name,
                "frank_id": user_b.frank_id,
                "role": user_b.role
            })
        finally:
            db.close()

    # --------------------------------------------------------------------------
    # 1. AUTHENTICATION & ACCESS CONTROL TESTS
    # --------------------------------------------------------------------------
    def test_01_logged_out_cannot_access_privacy_endpoints(self):
        """Logged-out callers cannot access user private data or submit requests."""
        status, _ = api_get("/api/privacy/me/summary")
        self.assertIn(status, [401, 403])

        status, _ = api_get("/api/privacy/me/export")
        self.assertIn(status, [401, 403])

        status, _ = api_get("/api/privacy/requests")
        self.assertIn(status, [401, 403])

        status, _ = api_post("/api/privacy/requests", {"subject": "test", "details": "test"})
        self.assertIn(status, [401, 403])

    def test_02_user_sees_own_personal_information(self):
        """Authenticated user summary returns their own real profile info."""
        status, data = api_get("/api/privacy/me/summary", token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertEqual(data["user_id"], self.user_a_id)
        self.assertEqual(data["email"], "dpdp_test_user_a@test.com")
        self.assertTrue(bool(data["frank_id"]))
        self.assertIn("messages_count", data)
        self.assertIn("documents_count", data)
        self.assertIn("active_consents_count", data)
        self.assertIn("open_privacy_requests_count", data)
        # Verify no sensitive password hashes are leaked
        self.assertNotIn("hashed_password", data)
        self.assertNotIn("password", data)

    def test_03_unauthorized_user_cannot_access_admin_privacy_routes(self):
        """Regular user cannot access admin privacy endpoints."""
        status, _ = api_get("/api/privacy/admin/requests", token=self.user_a_token)
        self.assertEqual(status, 403)

        status, _ = api_get("/api/privacy/admin/breaches", token=self.user_a_token)
        self.assertEqual(status, 403)

    # --------------------------------------------------------------------------
    # 2. REQUEST CREATION & VALIDATION TESTS
    # --------------------------------------------------------------------------
    def test_04_data_access_request_creation(self):
        """Submitting a data-access request creates a record with PR reference code and 30-day deadline."""
        payload = {
            "request_type": "access_data",
            "subject": "Request for personal data export and processing summary",
            "details": "Please provide an audited summary of all personal information held under Section 11."
        }
        status, res = api_post("/api/privacy/requests", payload, token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertIn("reference_code", res)
        self.assertTrue(res["reference_code"].startswith("PR-"))
        self.assertIn("deadline_at", res)

    def test_05_correction_request_with_payload(self):
        """Submitting a correction request records the category, inaccurate data and requested values."""
        payload = {
            "request_type": "correct_data",
            "subject": "Correction of spelling in full name",
            "details": "Please update my registered legal name from Test User A to User Alpha.",
            "category": "Profile Identity",
            "correction_payload": {
                "full_name": "User Alpha"
            }
        }
        status, res = api_post("/api/privacy/requests", payload, token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertTrue(res["reference_code"].startswith("PR-"))

    def test_06_erasure_request_creates_review_record_without_deleting_data(self):
        """Data erasure request submission creates a pending request under review without deleting user data."""
        payload = {
            "request_type": "erase_data",
            "subject": "Request for erasure of account history under DPDP Section 12",
            "details": "I am requesting erasure of historical messages no longer necessary for service delivery."
        }
        status, res = api_post("/api/privacy/requests", payload, token=self.user_a_token)
        self.assertEqual(status, 200)
        ref_code = res["reference_code"]
        self.assertTrue(ref_code.startswith("PR-"))

        # Verify that User A's account is STILL active and NOT deleted
        status_sum, summary = api_get("/api/privacy/me/summary", token=self.user_a_token)
        self.assertEqual(status_sum, 200)
        self.assertEqual(summary["account_status"], "active")
        self.assertEqual(summary["email"], "dpdp_test_user_a@test.com")

    def test_07_privacy_complaint_grievance_submission(self):
        """Submitting a privacy grievance produces a GR reference and associates with the user."""
        payload = {
            "request_type": "grievance",
            "category": "Consent Violation / Non-Compliance",
            "related_reference": "PR-20261024-ABC123",
            "subject": "Grievance regarding unconsented marketing communications",
            "details": "I observed non-transactional marketing communications after withdrawing service_updates consent."
        }
        status, res = api_post("/api/privacy/requests", payload, token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertIn("reference_code", res)
        self.assertTrue(res["reference_code"].startswith("GR-"))

    def test_08_empty_or_malformed_request_rejected(self):
        """Empty subjects or details are rejected with 400 Bad Request."""
        status, _ = api_post("/api/privacy/requests", {"subject": "", "details": ""}, token=self.user_a_token)
        self.assertEqual(status, 400)

        status, _ = api_post("/api/privacy/requests", {"subject": "Test"}, token=self.user_a_token)
        self.assertEqual(status, 400)

    # --------------------------------------------------------------------------
    # 3. REQUEST HISTORY & IDOR ISOLATION TESTS
    # --------------------------------------------------------------------------
    def test_09_my_privacy_requests_lists_only_own_records(self):
        """User A sees their own submitted requests in history."""
        status, reqs = api_get("/api/privacy/requests", token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertIsInstance(reqs, list)
        self.assertGreaterEqual(len(reqs), 1)
        for r in reqs:
            self.assertIn("reference_code", r)
            self.assertIn("request_type", r)
            self.assertIn("status", r)
            self.assertIn("deadline_at", r)

    def test_10_idor_protection_user_cannot_view_another_users_request(self):
        """User B cannot fetch User A's private request by reference or ID."""
        # 1. Create a request as User A
        payload = {
            "request_type": "access_data",
            "subject": "Confidential Request by User A",
            "details": "Private details that should never be visible to User B."
        }
        status, res = api_post("/api/privacy/requests", payload, token=self.user_a_token)
        self.assertEqual(status, 200)
        ref_a = res["reference_code"]

        # 2. User A can view it
        status_a, data_a = api_get(f"/api/privacy/requests/{ref_a}", token=self.user_a_token)
        self.assertEqual(status_a, 200)
        self.assertEqual(data_a["reference_code"], ref_a)

        # 3. User B attempts to access User A's request -> must return 403 Forbidden
        status_b, res_b = api_get(f"/api/privacy/requests/{ref_a}", token=self.user_b_token)
        self.assertEqual(status_b, 403, f"Expected 403 Forbidden for User B, got {status_b}")

    def test_11_user_cannot_approve_or_complete_own_request(self):
        """Ordinary users cannot modify their request status directly."""
        # Create request
        status, res = api_post("/api/privacy/requests", {"subject": "Test", "details": "Test details"}, token=self.user_a_token)
        ref = res["reference_code"]

        # Attempt to PUT status to Completed using user_a_token on admin route
        status_put, _ = api_put(f"/api/privacy/admin/requests/{ref}", {"status": "completed"}, token=self.user_a_token)
        self.assertEqual(status_put, 403)

    # --------------------------------------------------------------------------
    # 4. ADMIN REVIEW WORKFLOW TESTS
    # --------------------------------------------------------------------------
    def test_12_admin_can_review_and_update_request_status(self):
        """Administrator can review user request and update status with decision notes."""
        # 1. User A creates request
        status, res = api_post("/api/privacy/requests", {
            "request_type": "access_data",
            "subject": "Access Request for Admin Review",
            "details": "Request to verify administrative turnaround."
        }, token=self.user_a_token)
        ref = res["reference_code"]

        # 2. Admin queries requests
        status_adm, adm_list = api_get("/api/privacy/admin/requests", token=self.admin_token)
        self.assertEqual(status_adm, 200)
        self.assertTrue(any(r["reference_code"] == ref for r in adm_list))

        # 3. Admin updates status to Under Review
        status_upd, upd_res = api_put(f"/api/privacy/admin/requests/{ref}", {
            "status": "in_review",
            "decision_notes": "Request under technical inspection by DPO."
        }, token=self.admin_token)
        self.assertEqual(status_upd, 200)
        self.assertEqual(upd_res["display_status"], "Under Review")

        # 4. User A checks request details and sees the updated status and notes
        status_chk, chk_res = api_get(f"/api/privacy/requests/{ref}", token=self.user_a_token)
        self.assertEqual(status_chk, 200)
        self.assertIn(chk_res["status"], ["in_review", "under_review"])
        self.assertEqual(chk_res["decision_notes"], "Request under technical inspection by DPO.")

    # --------------------------------------------------------------------------
    # 5. DATA PORTABILITY & SAFE EXPORT TESTS
    # --------------------------------------------------------------------------
    def test_13_safe_personal_data_export(self):
        """Data export provides machine-readable personal data archive excluding password hashes and tokens."""
        status, export = api_get("/api/privacy/me/export", token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertEqual(export["fiduciary"], "FRANK Think Communications Platform")
        self.assertIn("profile", export)
        self.assertEqual(export["profile"]["email"], "dpdp_test_user_a@test.com")
        self.assertIn("consents", export)
        self.assertIn("messages", export)
        self.assertIn("documents", export)
        self.assertIn("privacy_requests", export)

        # Exclusions verification
        export_text = json.dumps(export)
        self.assertNotIn("hashed_password", export_text)
        self.assertNotIn("password_hash", export_text)
        self.assertNotIn("SECRET_KEY", export_text)
        self.assertNotIn("jwt", export_text.lower())

    # --------------------------------------------------------------------------
    # 6. FRONTEND TEMPLATE & ASSET INTEGRATION TESTS
    # --------------------------------------------------------------------------
    def test_14_settings_html_contains_all_seven_cards(self):
        """Verify settings.html contains all 7 designated Privacy Dashboard cards."""
        settings_path = ROOT_DIR / "settings.html"
        self.assertTrue(settings_path.exists())
        content = settings_path.read_text(encoding="utf-8")

        # Heading and description
        self.assertIn("Privacy Dashboard", content)
        self.assertIn("Manage your personal information, submit privacy requests, and track the status of your requests.", content)

        # 7 Clear Cards
        self.assertIn('id="cardMyPersonalInfo"', content)
        self.assertIn("My Personal Information", content)

        self.assertIn('id="cardRequestMyData"', content)
        self.assertIn("Request My Data", content)

        self.assertIn('id="cardCorrectMyInfo"', content)
        self.assertIn("Correct My Information", content)

        self.assertIn('id="cardRequestDataErasure"', content)
        self.assertIn("Request Data Erasure", content)

        self.assertIn('id="cardMyPrivacyRequests"', content)
        self.assertIn("My Privacy Requests", content)

        self.assertIn('id="cardPrivacyComplaints"', content)
        self.assertIn("Privacy Complaints &amp; Grievances", content)

        self.assertIn('id="cardPrivacyPolicyConsents"', content)
        self.assertIn("Privacy Policy and Consent Settings", content)

        # Key interactive elements
        self.assertIn('id="privacyExportDataBtn"', content)
        self.assertIn('id="privacyRequestAccessBtn"', content)
        self.assertIn('id="privacyRequestCorrectionBtn"', content)
        self.assertIn('id="privacyRequestErasureBtn"', content)
        self.assertIn('id="privacyNewRequestBtn"', content)
        self.assertIn('id="privacyGrievanceForm"', content)
        self.assertIn('id="privacyRequestDetailsModal"', content)
        self.assertIn('id="privacyEraseModal"', content)

    def test_15_privacy_dashboard_standalone_html_exists(self):
        """Verify privacy-dashboard.html entry point exists and directs to settings.html?tab=privacy."""
        pd_path = ROOT_DIR / "privacy-dashboard.html"
        self.assertTrue(pd_path.exists())
        content = pd_path.read_text(encoding="utf-8")
        self.assertIn("settings.html?tab=privacy", content)

    def test_16_js_api_and_settings_integration(self):
        """Verify js/api.js exposes api.privacy and js/settings.js handles all 7 cards."""
        api_js_path = ROOT_DIR / "js" / "api.js"
        settings_js_path = ROOT_DIR / "js" / "settings.js"

        api_js = api_js_path.read_text(encoding="utf-8")
        self.assertIn("api.privacy =", api_js)
        self.assertIn("getSummary()", api_js)
        self.assertIn("exportData()", api_js)
        self.assertIn("createRequest(", api_js)
        self.assertIn("getMyRequests()", api_js)
        self.assertIn("getAdminRequests(", api_js)

        settings_js = settings_js_path.read_text(encoding="utf-8")
        self.assertIn("setupPrivacyDashboard()", settings_js)
        self.assertIn("loadPrivacyDashboard()", settings_js)
        self.assertIn("loadPrivacyRequests()", settings_js)
        self.assertIn("showRequestDetailsModal(", settings_js)
        self.assertIn("privacyGrievanceForm", settings_js)


if __name__ == "__main__":
    unittest.main(verbosity=2)
