"""
Automated Test Suite for FRANK Think DPDP Part 3:
Data Deletion, Retention & Lifecycle Management
"""

import unittest
import json
import urllib.request
import urllib.error
import sys
import uuid
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


class TestDPDPPart3LifecycleRetention(unittest.TestCase):
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

        # 2. Setup Test User 1 (Requester) and Test User 2 (Observer)
        db = database.SessionLocal()
        try:
            user_part3_a = db.query(models.User).filter(models.User.email == "dpdp_part3_user_a@test.com").first()
            if not user_part3_a:
                user_part3_a = models.User(
                    username="user_part3_a",
                    email="dpdp_part3_user_a@test.com",
                    full_name="Part3 Erasure User",
                    hashed_password=security.hash_password("Password123!"),
                    frank_id="FAPART3A",
                    role="user",
                    is_active=True,
                    account_status="active"
                )
                db.add(user_part3_a)
                db.commit()
                db.refresh(user_part3_a)
            cls.user_a_id = user_part3_a.id
            cls.user_a_frank_id = user_part3_a.frank_id
            cls.user_a_token = security.create_access_token({
                "sub": user_part3_a.username,
                "user_id": user_part3_a.id,
                "email": user_part3_a.email,
                "full_name": user_part3_a.full_name,
                "frank_id": user_part3_a.frank_id,
                "role": user_part3_a.role
            })

            user_part3_b = db.query(models.User).filter(models.User.email == "dpdp_part3_user_b@test.com").first()
            if not user_part3_b:
                user_part3_b = models.User(
                    username="user_part3_b",
                    email="dpdp_part3_user_b@test.com",
                    full_name="Part3 Observer User",
                    hashed_password=security.hash_password("Password123!"),
                    frank_id="FAPART3B",
                    role="user",
                    is_active=True,
                    account_status="active"
                )
                db.add(user_part3_b)
                db.commit()
                db.refresh(user_part3_b)
            cls.user_b_id = user_part3_b.id
            cls.user_b_token = security.create_access_token({
                "sub": user_part3_b.username,
                "user_id": user_part3_b.id,
                "email": user_part3_b.email,
                "full_name": user_part3_b.full_name,
                "frank_id": user_part3_b.frank_id,
                "role": user_part3_b.role
            })

            # Setup isolated test user for lifecycle execution
            cls.exec_email = f"dpdp_exec_{uuid.uuid4().hex[:6]}@test.com"
            user_exec = models.User(
                username=f"exec_user_{uuid.uuid4().hex[:4]}",
                email=cls.exec_email,
                full_name="Execution Target User",
                hashed_password=security.hash_password("Password123!"),
                frank_id=f"FAEX{uuid.uuid4().hex[:4].upper()}",
                role="user",
                is_active=True,
                account_status="active"
            )
            db.add(user_exec)
            db.commit()
            db.refresh(user_exec)
            cls.exec_user_id = user_exec.id
            cls.exec_user_frank_id = user_exec.frank_id
            cls.exec_token = security.create_access_token({
                "sub": user_exec.username,
                "user_id": user_exec.id,
                "email": user_exec.email,
                "full_name": user_exec.full_name,
                "frank_id": user_exec.frank_id,
                "role": user_exec.role
            })

        finally:
            db.close()

    # 1. Retention Schedule Transparency Tests
    def test_01_public_retention_schedule(self):
        """Public transparency: anyone can view the retention schedule."""
        status, res = api_get("/api/privacy/retention-schedule")
        self.assertEqual(status, 200)
        self.assertIn("categories", res)
        self.assertIn("total_categories", res)
        self.assertGreaterEqual(res["total_categories"], 6)
        self.assertEqual(res["framework"], "Digital Personal Data Protection Act, 2023 (DPDPA)")

        # Verify key fields on each category
        for cat in res["categories"]:
            self.assertIn("category_code", cat)
            self.assertIn("category_name", cat)
            self.assertIn("retention_duration_display", cat)
            self.assertIn("disposal_method", cat)
            self.assertIn("statutory_exceptions", cat)
            self.assertIn("responsible_workflow", cat)
            self.assertIn("required_audit_metadata", cat)

    def test_02_authenticated_retention_schedule(self):
        """Authenticated users can retrieve the retention schedule seamlessly."""
        status, res = api_get("/api/privacy/retention-schedule", token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(res["total_categories"], 6)

    # 2. Retention Rule Configuration & Admin Authorization
    def test_03_admin_update_retention_rule(self):
        """Admin can modify retention parameters and lifecycle disposal metadata."""
        # Get existing rules list
        status, res = api_get("/api/privacy/admin/retention-rules", token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertGreater(len(res), 0)
        rule = res[0]
        rule_id = rule["id"]

        update_payload = {
            "retention_duration_days": 730,
            "disposal_method": "secure_pseudonymization_and_cryptographic_erasure",
            "statutory_exceptions": "DPDPA Sec 8(7), CERT-In 180-day logging mandate, pending disputes",
            "is_active": True,
            "requires_manual_review": True,
            "responsible_workflow": "Data Protection Officer & Security Compliance Team",
            "required_audit_metadata": "admin_user_id, timestamp, reason, target_records_count, integrity_hash"
        }
        status, updated = api_put(f"/api/privacy/admin/retention-rules/{rule_id}", update_payload, token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertEqual(updated["retention_duration_days"], 730)
        self.assertEqual(updated["requires_manual_review"], True)
        self.assertEqual(updated["responsible_workflow"], "Data Protection Officer & Security Compliance Team")

    def test_04_non_admin_cannot_update_retention_rules(self):
        """Ordinary users cannot modify retention rules (403 Forbidden)."""
        status, res = api_put("/api/privacy/admin/retention-rules/1", {"retention_duration_days": 30}, token=self.user_a_token)
        self.assertEqual(status, 403)

    # 3. Retention Evaluation Engine (Dry Run vs Live Safety Checks)
    def test_05_retention_evaluation_dry_run_default(self):
        """Retention evaluation defaults to dry_run=True, identifying eligible records without modifying or deleting data."""
        payload = {
            "category_code": "all",
            "dry_run": True
        }
        status, res = api_post("/api/privacy/admin/retention/evaluate", payload, token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertTrue(res["dry_run"])
        self.assertEqual(res["status"], "simulation_complete")
        self.assertIn("evaluation_summary", res)
        self.assertIn("categories_evaluated", res)

    def test_06_retention_evaluation_live_requires_explicit_confirmation(self):
        """Live retention evaluation fails safely without explicit confirmation text."""
        payload = {
            "category_code": "account_data",
            "dry_run": False,
            "confirm_execution": "WRONG_CONFIRMATION"
        }
        status, res = api_post("/api/privacy/admin/retention/evaluate", payload, token=self.admin_token)
        self.assertEqual(status, 400)
        self.assertIn("Safety check failed", res["detail"])

    def test_07_non_admin_cannot_evaluate_retention(self):
        """Non-admin user cannot invoke retention evaluation."""
        status, res = api_post("/api/privacy/admin/retention/evaluate", {"dry_run": True}, token=self.user_a_token)
        self.assertEqual(status, 403)

    # 4. Erasure Lifecycle Impact Preview
    def test_08_erasure_lifecycle_preview(self):
        """Requester can inspect lifecycle impact preview before execution."""
        # 1. Create an erasure request
        req_payload = {
            "request_type": "erasure",
            "reason": "Exercising Section 12 Right to Erasure under DPDP Act 2023",
            "data_categories": ["account_data", "messaging_data"]
        }
        status, req = api_post("/api/privacy/requests", req_payload, token=self.user_a_token)
        self.assertIn(status, [200, 201])
        ref = req.get("reference_number") or req.get("reference_code")

        # 2. Get lifecycle preview as owner
        status, preview = api_get(f"/api/privacy/requests/{ref}/lifecycle-preview", token=self.user_a_token)
        self.assertEqual(status, 200)
        self.assertEqual(preview["request_reference"], ref)
        self.assertEqual(preview["user_id"], self.user_a_id)
        self.assertIn("affected_items", preview)
        self.assertIn("legal_holds", preview)
        self.assertIn("disposal_strategy", preview)
        self.assertTrue(preview["disposal_strategy"]["mutual_chat_preservation"])

    def test_09_erasure_lifecycle_preview_idor_protection(self):
        """User B cannot view User A's erasure lifecycle preview (403 Forbidden)."""
        req_payload = {
            "request_type": "erasure",
            "reason": "IDOR check request",
            "data_categories": ["account_data"]
        }
        status, req = api_post("/api/privacy/requests", req_payload, token=self.user_a_token)
        self.assertIn(status, [200, 201])
        ref = req.get("reference_number") or req.get("reference_code")

        status, res = api_get(f"/api/privacy/requests/{ref}/lifecycle-preview", token=self.user_b_token)
        self.assertEqual(status, 403)

    # 5. Staged Erasure Lifecycle Execution Workflow
    def test_10_erasure_execution_workflow_staged_lifecycle(self):
        """
        Tests complete staged lifecycle execution:
        1. User submits erasure request (Status: Submitted).
        2. Execution fails if request is not approved (Status != Approved for Processing).
        3. DPO/Admin reviews & moves status to 'Approved for Processing'.
        4. Execution requires exact confirmation phrase 'CONFIRM_EXECUTE_ERASURE'.
        5. Execution de-identifies profile, revokes consents, preserves mutual chat context, marks Completed.
        6. Retrying completed execution is idempotent and fails safely.
        """
        # Step 1: Submit erasure request for test target user
        req_payload = {
            "request_type": "erasure",
            "reason": "Complete account lifecycle retirement under DPDPA",
            "data_categories": ["account_data", "messaging_data", "consent_records"]
        }
        status, req = api_post("/api/privacy/requests", req_payload, token=self.exec_token)
        self.assertIn(status, [200, 201])
        ref = req.get("reference_number") or req.get("reference_code")
        req_id = req["id"]
        self.assertEqual(req["status"].lower(), "submitted")

        # Step 2: Attempt execution while still in 'submitted' status -> Should fail with 400
        exec_payload = {
            "confirmation_text": "CONFIRM_EXECUTE_ERASURE",
            "preserve_mutual_chat_context": True,
            "completion_notes": "Attempting premature execution"
        }
        status, res = api_post(f"/api/privacy/admin/requests/{ref}/execute-lifecycle", exec_payload, token=self.admin_token)
        self.assertEqual(status, 400)
        self.assertIn("Approved for Processing", res["detail"])

        # Step 3: Admin moves status to 'approved_for_processing'
        approval_payload = {
            "status": "approved_for_processing",
            "admin_notes": "Reviewed by DPO. Legal holds evaluated. Approved for staged lifecycle execution."
        }
        status, updated_req = api_put(f"/api/privacy/admin/requests/{req_id}", approval_payload, token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertEqual(updated_req["status"], "approved_for_processing")

        # Step 4: Attempt execution with invalid confirmation phrase -> Should fail with 400
        bad_exec_payload = {
            "confirmation_text": "INVALID_TEXT",
            "preserve_mutual_chat_context": True
        }
        status, res = api_post(f"/api/privacy/admin/requests/{ref}/execute-lifecycle", bad_exec_payload, token=self.admin_token)
        self.assertEqual(status, 400)
        self.assertIn("Safety confirmation phrase mismatch", res["detail"])

        # Step 5: Execute staged erasure lifecycle with proper confirmation
        valid_exec_payload = {
            "confirmation_text": "CONFIRM_EXECUTE_ERASURE",
            "preserve_mutual_chat_context": True,
            "completion_notes": "Successfully executed staged de-identification under DPDPA Sec 12."
        }
        status, exec_result = api_post(f"/api/privacy/admin/requests/{ref}/execute-lifecycle", valid_exec_payload, token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertEqual(exec_result["status"], "completed")
        self.assertTrue(exec_result["lifecycle_results"]["user_deidentified"])
        self.assertEqual(exec_result["lifecycle_results"]["account_status"], "erased_and_deactivated")

        # Verify DB state of user
        db = database.SessionLocal()
        try:
            target_user = db.query(models.User).filter(models.User.id == self.exec_user_id).first()
            self.assertIsNotNone(target_user)
            self.assertEqual(target_user.full_name, "Deleted User")
            self.assertFalse(target_user.is_active)
            self.assertEqual(target_user.account_status, "erased_and_deactivated")
            self.assertTrue(target_user.username.startswith("deleted_"))
        finally:
            db.close()

        # Step 6: Idempotency check: Retrying execution on a completed request is rejected safely
        status, retry_res = api_post(f"/api/privacy/admin/requests/{ref}/execute-lifecycle", valid_exec_payload, token=self.admin_token)
        self.assertEqual(status, 400)
        self.assertIn("already processed", retry_res["detail"].lower())

    # 6. Part 3 Lifecycle Statuses Integrity
    def test_11_all_part3_lifecycle_statuses_supported(self):
        """Verify that all Part 3 lifecycle statuses are supported in request management."""
        # Create request
        req_payload = {
            "request_type": "correction",
            "reason": "Test status lifecycle transitions",
            "data_categories": ["account_data"]
        }
        status, req = api_post("/api/privacy/requests", req_payload, token=self.user_a_token)
        self.assertIn(status, [200, 201])
        req_id = req["id"]

        statuses_to_test = [
            "under_review",
            "awaiting_information",
            "approved_for_processing",
            "processing",
            "rejected"
        ]

        for s in statuses_to_test:
            status, res = api_put(f"/api/privacy/admin/requests/{req_id}", {"status": s, "admin_notes": f"Testing status {s}"}, token=self.admin_token)
            self.assertEqual(status, 200)
            self.assertEqual(res["status"], s)

    # 7. UI Verification
    def test_12_ui_elements_in_settings_html(self):
        """Verify settings.html contains Card 8 and 4-stage lifecycle flow elements."""
        settings_path = ROOT_DIR / "settings.html"
        self.assertTrue(settings_path.exists())
        content = settings_path.read_text(encoding="utf-8")

        self.assertIn("cardDataRetentionSchedule", content)
        self.assertIn("btnRefreshRetentionSchedule", content)
        self.assertIn("privacyRetentionScheduleTableBody", content)
        self.assertIn("lifecycleFlowGuide", content)
        self.assertIn("4-Stage Privacy Lifecycle Process", content)
        self.assertIn("Submitted", content)
        self.assertIn("Legal Review", content)
        self.assertIn("Processing", content)
        self.assertIn("Completed", content)


if __name__ == "__main__":
    unittest.main()
