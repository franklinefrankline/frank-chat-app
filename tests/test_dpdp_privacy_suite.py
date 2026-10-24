"""
Comprehensive Test Suite for FRANK Think DPDP Privacy & Data Protection Module
Aligned with India's Digital Personal Data Protection Act, 2023 & Rules 2025.
"""

import sys
import os
import pytest
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Ensure backend path is configured
backend_dir = Path(__file__).resolve().parent.parent / "backend"
os.chdir(str(backend_dir))
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
import main
import models
import database
import security
from services import smart_service

app = main.app
client = TestClient(app)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

import uuid

def get_or_create_test_user(db, username="privacy_tester", is_admin=False):
    """Safely get or create a test user for privacy testing without touching existing records."""
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        hashed_pwd = security.hash_password("PrivacyTestPass123!")
        user = models.User(
            email=f"{username}_{uuid.uuid4().hex[:4]}@example.com",
            username=username,
            full_name=f"Test {username.capitalize()}",
            hashed_password=hashed_pwd,
            frank_id=f"F{uuid.uuid4().hex[:5].upper()}",
            role="admin" if is_admin else "user",
            is_active=True,
            account_status="active"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif is_admin and user.role != "admin":
        user.role = "admin"
        db.commit()
    return user

def create_auth_headers(user):
    token = security.create_access_token({"sub": user.username, "user_id": user.id})
    return {"Authorization": f"Bearer {token}"}


class TestDPDPPrivacyPolicyAndInventory:
    """1. Privacy Policy, Notice, and Data Inventory tests"""

    def test_privacy_policy_endpoint(self):
        """Verify GET /api/privacy/policy returns complete DPDP statutory disclosures."""
        res = client.get("/api/privacy/policy")
        assert res.status_code == 200
        data = res.json()
        assert data["fiduciary_name"] == "FRANK Think Communications Platform"
        assert data["grievance_officer"]["email"] == "frankthink12@gmail.com"
        assert data["statutory_framework"] == "Digital Personal Data Protection Act, 2023 & DPDP Rules 2025"
        assert len(data["categories"]) >= 5
        assert len(data["third_party_recipients"]) >= 3
        # Ensure honest claims: no false end-to-end encryption claims
        assert "TLS 1.3" in data["security_measures"]["transport_encryption"]

    def test_data_inventory_endpoint(self):
        """Verify GET /api/privacy/data-inventory returns internal inventory with retention policies."""
        res = client.get("/api/privacy/data-inventory")
        assert res.status_code == 200
        inventory = res.json()
        assert len(inventory) >= 5
        categories = [item["category_code"] for item in inventory]
        assert "chat_messages" in categories
        assert "uploaded_documents" in categories
        assert "security_audit_logs" in categories


class TestConsentManagementAndAIGating:
    """2. Granular consent recording, withdrawal, and AI gatekeeping tests"""

    def test_unauthenticated_consent_access_rejected(self):
        """Ensure consent endpoints reject unauthenticated requests."""
        res = client.get("/api/privacy/consents")
        assert res.status_code == 401

    def test_consent_retrieval_and_update(self):
        """Ensure user can view and toggle granular consent preferences."""
        db = database.SessionLocal()
        try:
            user = get_or_create_test_user(db, "consent_user")
            headers = create_auth_headers(user)

            # 1. Fetch consents
            res = client.get("/api/privacy/consents", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert "items" in data

            # 2. Update optional AI consent to False
            update_payload = {
                "consents": [
                    {"purpose_code": "ai_processing", "granted": False},
                    {"purpose_code": "service_updates", "granted": True}
                ]
            }
            res_update = client.post("/api/privacy/consents", json=update_payload, headers=headers)
            assert res_update.status_code == 200
            update_data = res_update.json()
            assert update_data["status"] == "success"

            # 3. Verify AI Gatekeeper respects the withdrawn consent
            has_consent = smart_service.user_has_ai_consent(db, user.id)
            assert has_consent is False, "Withdrawn consent must disable AI external transmission"

            # 4. Re-grant AI consent
            client.post("/api/privacy/consents", json={"consents": [{"purpose_code": "ai_processing", "granted": True}]}, headers=headers)
            assert smart_service.user_has_ai_consent(db, user.id) is True
        finally:
            db.close()


class TestDataPrincipalRightsAndIDOR:
    """3. Data Principal Rights: access, correction, export, and IDOR protection"""

    def test_personal_data_summary(self):
        """Verify GET /api/privacy/me/summary provides accurate metrics."""
        db = database.SessionLocal()
        try:
            user = get_or_create_test_user(db, "summary_user")
            headers = create_auth_headers(user)

            res = client.get("/api/privacy/me/summary", headers=headers)
            assert res.status_code == 200
            summary = res.json()
            assert summary["username"] == "summary_user"
            assert "messages_count" in summary
            assert "documents_count" in summary
            assert "active_consents_count" in summary
        finally:
            db.close()

    def test_data_portability_export(self):
        """Verify GET /api/privacy/me/export provides full machine-readable JSON archive."""
        db = database.SessionLocal()
        try:
            user = get_or_create_test_user(db, "export_user")
            headers = create_auth_headers(user)

            res = client.get("/api/privacy/me/export", headers=headers)
            assert res.status_code == 200
            export = res.json()
            assert export["format_version"] == "DPDP-Export-v1"
            assert export["profile"]["email"] == "export_user@example.com"
            assert "messages" in export
            assert "active_consents" in export
        finally:
            db.close()

    def test_privacy_request_workflow_and_deadline(self):
        """Verify filing privacy request generates reference and 30-day deadline."""
        db = database.SessionLocal()
        try:
            user = get_or_create_test_user(db, "rights_user")
            headers = create_auth_headers(user)

            payload = {
                "request_type": "correct_data",
                "subject": "Correction of full name",
                "details": "My official legal name spelling has changed.",
                "field_to_correct": "full_name",
                "corrected_value": "Rights User Official"
            }
            res = client.post("/api/privacy/requests", json=payload, headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["reference_code"].startswith("PR-")
            assert data["status"] == "submitted"
            
            # Verify 30-day statutory deadline calculation
            deadline = datetime.fromisoformat(data["deadline_at"].replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            days_diff = (deadline - now).days
            assert 28 <= days_diff <= 31

            # Fetch my requests
            list_res = client.get("/api/privacy/requests", headers=headers)
            assert list_res.status_code == 200
            items = list_res.json()
            assert any(item["reference_code"] == data["reference_code"] for item in items)
        finally:
            db.close()

    def test_idor_protection_between_users(self):
        """Verify User A cannot inspect or access User B's privacy requests."""
        db = database.SessionLocal()
        try:
            user_a = get_or_create_test_user(db, "user_alpha")
            user_b = get_or_create_test_user(db, "user_beta")
            headers_a = create_auth_headers(user_a)
            headers_b = create_auth_headers(user_b)

            # User A creates request
            res_a = client.post("/api/privacy/requests", json={
                "request_type": "access_data",
                "subject": "User A Private Request",
                "details": "Confidential details"
            }, headers=headers_a)
            ref_a = res_a.json()["reference_code"]

            # User B attempts to access User A's request by reference
            res_b = client.get(f"/api/privacy/requests/{ref_a}", headers=headers_b)
            assert res_b.status_code in [403, 404], "IDOR vulnerability: User B accessed User A's privacy request"
        finally:
            db.close()


class TestAdminPrivacyManagementAndBreachRegister:
    """4. Admin controls, request status decisions, breach register, and retention rules"""

    def test_non_admin_cannot_access_admin_privacy(self):
        """Ensure standard users cannot query or decide privacy requests."""
        db = database.SessionLocal()
        try:
            regular_user = get_or_create_test_user(db, "regular_user", is_admin=False)
            headers = create_auth_headers(regular_user)

            res = client.get("/api/privacy/admin/requests", headers=headers)
            assert res.status_code == 403

            res_breach = client.get("/api/privacy/admin/breaches", headers=headers)
            assert res_breach.status_code == 403
        finally:
            db.close()

    def test_admin_can_review_request_with_decision_notes(self):
        """Verify admin can review user request and save decision notes with audit trail."""
        db = database.SessionLocal()
        try:
            user = get_or_create_test_user(db, "req_target_user", is_admin=False)
            admin = get_or_create_test_user(db, "privacy_admin", is_admin=True)

            # User creates request
            headers_user = create_auth_headers(user)
            res_req = client.post("/api/privacy/requests", json={
                "request_type": "grievance",
                "subject": "Email notification concern",
                "details": "Testing grievance handling."
            }, headers=headers_user)
            ref = res_req.json()["reference_code"]

            # Admin reviews and completes request
            headers_admin = create_auth_headers(admin)
            update_payload = {
                "status": "completed",
                "decision_notes": "Grievance reviewed by DPO. Unsubscribed from bulletin emails.",
                "assigned_to": "Data Protection Officer"
            }
            res_decision = client.put(f"/api/privacy/admin/requests/{ref}", json=update_payload, headers=headers_admin)
            assert res_decision.status_code == 200
            data = res_decision.json()
            assert data["status"] == "completed"
            assert "DPO" in data["decision_notes"]
            assert data["decided_at"] is not None
        finally:
            db.close()

    def test_breach_incident_registration(self):
        """Verify admin can log and list statutory breach incidents under DPDP § 8(6)."""
        db = database.SessionLocal()
        try:
            admin = get_or_create_test_user(db, "privacy_admin", is_admin=True)
            headers_admin = create_auth_headers(admin)

            breach_payload = {
                "title": "Automated security test incident",
                "severity": "medium",
                "affected_systems": "API Gateway, Auth Layer",
                "personal_data_categories": "IP addresses, session metadata",
                "containment_steps": "Rate limiter threshold adjusted; tokens invalidated",
                "authorities_notified": False
            }
            res = client.post("/api/privacy/admin/breaches", json=breach_payload, headers=headers_admin)
            assert res.status_code == 200
            data = res.json()
            assert data["incident_reference"].startswith("IN-")
            assert data["title"] == breach_payload["title"]

            # List breaches
            list_res = client.get("/api/privacy/admin/breaches", headers=headers_admin)
            assert list_res.status_code == 200
            assert any(b["incident_reference"] == data["incident_reference"] for b in list_res.json())
        finally:
            db.close()

    def test_data_retention_rules_retrieval(self):
        """Verify admin can view active data retention rules."""
        db = database.SessionLocal()
        try:
            admin = get_or_create_test_user(db, "privacy_admin", is_admin=True)
            headers_admin = create_auth_headers(admin)

            res = client.get("/api/privacy/admin/retention-rules", headers=headers_admin)
            assert res.status_code == 200
            rules = res.json()
            assert len(rules) >= 6
            rule_names = [r["category_code"] for r in rules]
            assert any("messages" in r for r in rule_names)
            assert any("documents" in r for r in rule_names)
            assert "security_audit_logs" in rule_names
        finally:
            db.close()


class TestAccountErasureAndChatContinuity:
    """5. Staged account erasure, identity verification, and message preservation"""

    def test_erasure_requires_password_and_confirmation(self):
        """Verify account deletion fails without correct password and confirmation text."""
        db = database.SessionLocal()
        try:
            user = get_or_create_test_user(db, "erasure_candidate")
            headers = create_auth_headers(user)

            # 1. Invalid confirmation text
            res_bad_confirm = client.post("/api/privacy/erase-account", json={
                "password": "PrivacyTestPass123!",
                "confirm_text": "NOT_DELETE",
                "reason": "Test"
            }, headers=headers)
            assert res_bad_confirm.status_code == 400

            # 2. Invalid password
            res_bad_pwd = client.post("/api/privacy/erase-account", json={
                "password": "WrongPassword!",
                "confirm_text": "DELETE",
                "reason": "Test"
            }, headers=headers)
            assert res_bad_pwd.status_code == 401
        finally:
            db.close()

    def test_successful_staged_erasure_and_anonymization(self):
        """Verify successful erasure anonymizes credentials and marks account inactive."""
        db = database.SessionLocal()
        try:
            user = get_or_create_test_user(db, "erasure_final_user")
            headers = create_auth_headers(user)

            res = client.post("/api/privacy/erase-account", json={
                "password": "PrivacyTestPass123!",
                "confirm_text": "DELETE",
                "reason": "Data principal test erasure"
            }, headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "erased"

            # Verify in DB: credentials anonymized, account disabled
            db.expire_all()
            erased_user = db.query(models.User).filter(models.User.id == user.id).first()
            assert erased_user.is_active is False
            assert erased_user.account_status == "deleted"
            assert erased_user.full_name == "Deleted User"
            assert "deleted_" in erased_user.email
            assert "deleted_" in erased_user.username
        finally:
            db.close()


if __name__ == "__main__":
    pytest.main(["-v", __file__])
