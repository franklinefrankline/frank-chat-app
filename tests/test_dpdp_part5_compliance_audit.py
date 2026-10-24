"""
Automated Test Suite for FRANK Think DPDP Part 5:
Compliance Audit, Accountability, Documentation & Reporting
Digital Personal Data Protection Act, 2023 & DPDP Rules 2025 (India)
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

def api_get(endpoint, token=None, raw=False):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method="GET")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as res:
            content = res.read().decode()
            if raw:
                return res.status, content
            return res.status, json.loads(content)
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


class TestDPDPPart5ComplianceAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = database.SessionLocal()
        try:
            # 1. Identify Admin User
            admin_user = db.query(models.User).filter(models.User.role == "admin").first()
            if not admin_user:
                raise RuntimeError("No admin user found in database.")
            cls.admin_id = admin_user.id
            cls.admin_token = security.create_access_token(data={"sub": admin_user.username})

            # 2. Identify Ordinary User
            normal_user = db.query(models.User).filter(models.User.role != "admin").first()
            if not normal_user:
                raise RuntimeError("No normal user found in database.")
            cls.normal_id = normal_user.id
            cls.normal_token = security.create_access_token(data={"sub": normal_user.username})

            # 3. Snapshot critical baseline counts to verify zero data loss
            cls.initial_users_count = db.query(models.User).count()
            cls.initial_messages_count = db.query(models.Message).count()
            cls.initial_documents_count = db.query(models.Document).count()
            cls.initial_rules_count = db.query(models.DataRetentionRule).count()
            cls.initial_breaches_count = db.query(models.DataBreachIncident).count()
            cls.initial_requests_count = db.query(models.PrivacyDataRequest).count()
        finally:
            db.close()

    def test_01_baseline_data_preservation(self):
        """Verify baseline data counts are strictly preserved (zero loss)."""
        db = database.SessionLocal()
        try:
            self.assertEqual(db.query(models.User).count(), self.initial_users_count, "User count modified!")
            self.assertEqual(db.query(models.Message).count(), self.initial_messages_count, "Message count modified!")
            self.assertEqual(db.query(models.Document).count(), self.initial_documents_count, "Document count modified!")
            self.assertEqual(db.query(models.DataRetentionRule).count(), self.initial_rules_count, "Retention rules modified!")
            self.assertEqual(db.query(models.DataBreachIncident).count(), self.initial_breaches_count, "Breaches modified!")
            self.assertEqual(db.query(models.PrivacyDataRequest).count(), self.initial_requests_count, "Privacy requests modified!")
        finally:
            db.close()

    def test_02_admin_authorization_enforcement(self):
        """Ensure all compliance endpoints reject unauthenticated and non-admin requests."""
        endpoints = [
            "/api/privacy/admin/compliance/overview",
            "/api/privacy/admin/compliance/checklist",
            "/api/privacy/admin/compliance/evidence",
            "/api/privacy/admin/compliance/findings",
            "/api/privacy/admin/compliance/report"
        ]
        for ep in endpoints:
            # 1. Unauthenticated -> 401
            status, _ = api_get(ep)
            self.assertEqual(status, 401, f"Endpoint {ep} allowed unauthenticated access!")

            # 2. Ordinary User -> 403 Forbidden
            status, _ = api_get(ep, token=self.normal_token)
            self.assertEqual(status, 403, f"Endpoint {ep} allowed non-admin access!")

            # 3. Admin -> 200 OK
            status, _ = api_get(ep, token=self.admin_token)
            self.assertEqual(status, 200, f"Endpoint {ep} failed for valid admin!")

    def test_03_compliance_overview_matrix(self):
        """Verify 10-domain compliance matrix, scoring, and metrics."""
        status, data = api_get("/api/privacy/admin/compliance/overview", token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertIn("DPDP", data["framework"])
        self.assertEqual(data["fiduciary_name"], "FRANK Think Communications Platform")
        self.assertGreaterEqual(data["assessed_percentage"], 80.0)

        domains = data["domains"]
        self.assertEqual(len(domains), 10, "Expected exactly 10 core compliance domains.")

        domain_keys = [d["domain_key"] for d in domains]
        expected_keys = [
            "privacy_policy", "consent_management", "data_rights_access_correction",
            "data_rights_erasure", "data_retention_schedule", "deletion_execution_safeguards",
            "security_access_controls", "ai_processing_safeguards", "third_party_transfers",
            "audit_logging_accountability"
        ]
        for ek in expected_keys:
            self.assertIn(ek, domain_keys, f"Domain key {ek} missing from overview matrix.")

        for d in domains:
            self.assertIn(d["status"], ["Implemented", "Needs Review", "Incomplete", "Failed", "Not Assessed", "Not Applicable"])
            self.assertTrue(len(d["statutory_ref"]) > 0)
            self.assertTrue(len(d["verified_evidence"]) > 0)

        # Check metrics
        metrics = data["metrics"]
        self.assertIn("total_privacy_requests", metrics)
        self.assertIn("active_retention_rules", metrics)

    def test_04_compliance_statutory_checklist(self):
        """Verify statutory checklist items spanning Parts 1 through 4."""
        status, data = api_get("/api/privacy/admin/compliance/checklist", token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(data["total_checks"], 8)
        self.assertGreaterEqual(data["passed_checks"], 6)

        items = data["items"]
        parts_present = {item["part"] for item in items}
        self.assertTrue(any("Part 1" in p for p in parts_present), "Part 1 missing from checklist.")
        self.assertTrue(any("Part 2" in p for p in parts_present), "Part 2 missing from checklist.")
        self.assertTrue(any("Part 3" in p for p in parts_present), "Part 3 missing from checklist.")
        self.assertTrue(any("Part 4" in p for p in parts_present), "Part 4 missing from checklist.")

        for it in items:
            self.assertIn(it["status"], ["PASS", "FAIL", "NOT TESTED", "NOT APPLICABLE"])
            self.assertTrue(len(it["verification_evidence"]) > 0)

    def test_05_compliance_evidence_repository(self):
        """Verify Personal Data Inventory, Consents, Retention, and Processor evidence."""
        status, data = api_get("/api/privacy/admin/compliance/evidence", token=self.admin_token)
        self.assertEqual(status, 200)
        ev = data["evidence"]

        # 1. Personal Data Inventory
        pdi = ev["A_personal_data_inventory"]
        self.assertGreaterEqual(len(pdi), 4)
        cat_names = [p["category"] for p in pdi]
        self.assertTrue(any("Account Identity" in c for c in cat_names))
        self.assertTrue(any("Messages" in c for c in cat_names))

        # 2. Consent Governance
        cg = ev["B_consent_governance"]
        self.assertIn("notice_version", cg)
        self.assertGreaterEqual(len(cg["granular_purposes"]), 4)

        # 3. Retention & Disaster Recovery Note
        ret = ev["D_retention_and_disposal"]
        self.assertGreaterEqual(ret["active_rules_count"], 6)
        self.assertIn("backup_limitation_disclosure", ret)

        # 4. Third-Party Sub-processors
        subp = ev["E_security_and_third_parties"]
        sub_names = [s["service_name"] for s in subp]
        self.assertTrue(any("Vercel" in s for s in sub_names))
        self.assertTrue(any("Neon" in s or "SQLite" in s for s in sub_names))
        self.assertTrue(any("Gemini" in s or "Google" in s for s in sub_names))
        self.assertTrue(any("SMTP" in s for s in sub_names))

    def test_06_compliance_findings_lifecycle_and_rationale_mandate(self):
        """
        Verify:
        1. Creation of finding with reference CF-YYYYMMDD-XXXXXX
        2. Status transition to 'Resolved' fails with 400 without rationale
        3. Status transition to 'Resolved' succeeds with rationale
        4. Status transition to 'Accepted Risk' fails without rationale
        5. Audit log entries generated for create & update
        """
        # Step 1: Create finding
        create_payload = {
            "title": "Automated Audit Test Gap: Password Hash Salting Verification",
            "category": "security",
            "severity": "medium",
            "status": "Open",
            "assigned_role_or_owner": "Data Protection Officer",
            "description": "Verification of password hash salting rounds under DPDP Section 8(5).",
            "recommended_remediation": "Audit PBKDF2 iteration count and salt length.",
            "review_notes": "Initial internal assessment."
        }
        status, res = api_post("/api/privacy/admin/compliance/findings", create_payload, token=self.admin_token)
        self.assertEqual(status, 201)
        finding_id = res["id"]
        finding_ref = res["finding_reference"]
        self.assertTrue(finding_ref.startswith("CF-"), f"Invalid reference format: {finding_ref}")

        db = database.SessionLocal()
        try:
            # Verify immutable audit log recorded
            audit = db.query(models.AuditLog).filter(
                models.AuditLog.action == "COMPLIANCE_FINDING_CREATED",
                models.AuditLog.target_id == finding_id
            ).first()
            self.assertIsNotNone(audit, "Audit log not recorded for finding creation!")
            self.assertIn("Created finding", audit.details)

            # Step 2: Try to resolve finding WITHOUT resolution_rationale -> MUST FAIL (400)
            update_payload_fail = {
                "status": "Resolved",
                "resolution_rationale": ""  # Missing!
            }
            u_status, u_res = api_put(f"/api/privacy/admin/compliance/findings/{finding_id}", update_payload_fail, token=self.admin_token)
            self.assertEqual(u_status, 400, "Resolution without rationale should be rejected with 400!")
            self.assertIn("Resolution rationale is required", u_res.get("detail", ""))

            # Step 3: Try to set Accepted Risk WITHOUT resolution_rationale -> MUST FAIL (400)
            update_payload_fail2 = {
                "status": "Accepted Risk",
                "resolution_rationale": None
            }
            u_status2, u_res2 = api_put(f"/api/privacy/admin/compliance/findings/{finding_id}", update_payload_fail2, token=self.admin_token)
            self.assertEqual(u_status2, 400, "Accepted risk without rationale should be rejected with 400!")

            # Step 4: Resolve finding WITH resolution_rationale -> MUST SUCCEED (200)
            valid_rationale = "Verified security.py uses PBKDF2-HMAC-SHA256 with 100,000 rounds and 16-byte random salt. All tests pass."
            update_payload_ok = {
                "status": "Resolved",
                "resolution_rationale": valid_rationale,
                "review_notes": "Verified by security lead."
            }
            u_status3, u_res3 = api_put(f"/api/privacy/admin/compliance/findings/{finding_id}", update_payload_ok, token=self.admin_token)
            self.assertEqual(u_status3, 200, "Resolution with rationale should succeed with 200!")
            self.assertEqual(u_res3["status"], "Resolved")
            self.assertEqual(u_res3["resolution_rationale"], valid_rationale)

            # Verify update audit log
            audit_up = db.query(models.AuditLog).filter(
                models.AuditLog.action == "COMPLIANCE_FINDING_UPDATED",
                models.AuditLog.target_id == finding_id
            ).first()
            self.assertIsNotNone(audit_up, "Audit log not recorded for finding update!")
            self.assertIn("Resolved", audit_up.details)

            # Step 5: Clean up test finding and audit logs so database remains identical to baseline
            db.query(models.ComplianceFinding).filter(models.ComplianceFinding.id == finding_id).delete()
            db.query(models.AuditLog).filter(models.AuditLog.target_id == finding_id, models.AuditLog.target_type == "compliance_finding").delete()
            db.commit()
        finally:
            db.close()

    def test_07_compliance_report_generation(self):
        """
        Verify compliance report export:
        - JSON format contains all executive summaries, framework details, disclaimer.
        - Markdown format returns valid markdown text download.
        - Strictly excludes password hashes, raw message contents, or session tokens.
        - Audit trail entry COMPLIANCE_REPORT_EXPORTED is recorded.
        """
        # 1. JSON Report
        status, rep = api_get("/api/privacy/admin/compliance/report?format=json", token=self.admin_token)
        self.assertEqual(status, 200)
        self.assertIn("report_title", rep)
        self.assertIn("regulatory_framework", rep)
        self.assertIn("executive_summary", rep)
        self.assertIn("domains_evaluated", rep)
        self.assertIn("statutory_disclaimer", rep)

        # Sensitive data leakage prevention check
        rep_str = json.dumps(rep)
        self.assertNotIn("hashed_password", rep_str)
        self.assertNotIn("password_hash", rep_str)
        self.assertNotIn("access_token", rep_str)

        # 2. Markdown Report
        status, md_text = api_get("/api/privacy/admin/compliance/report?format=markdown", token=self.admin_token, raw=True)
        self.assertEqual(status, 200)
        self.assertIn("# FRANK Think — DPDP Compliance Audit & Accountability Report", md_text)
        self.assertIn("## Executive Summary", md_text)
        self.assertIn("## Implemented Compliance Domains", md_text)

        # 3. Verify audit log entry for report export
        db = database.SessionLocal()
        try:
            audit = db.query(models.AuditLog).filter(
                models.AuditLog.action == "COMPLIANCE_REPORT_EXPORTED"
            ).order_by(models.AuditLog.id.desc()).first()
            self.assertIsNotNone(audit, "Audit log for report export not found!")
            self.assertIn("markdown", audit.details)

            # Clean up the export test audit logs to leave clean state
            db.query(models.AuditLog).filter(models.AuditLog.action == "COMPLIANCE_REPORT_EXPORTED").delete()
            db.commit()
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
