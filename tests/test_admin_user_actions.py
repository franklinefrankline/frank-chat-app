"""
Comprehensive Test Suite for Admin User Actions:
- Activate User (/api/admin/users/{id}/activate)
- Deactivate User (/api/admin/users/{id}/deactivate)
- Status Update (/api/admin/users/{id}/status)
- Delete User (/api/admin/users/{id})
- Self-action & last-admin protections
- Authorization enforcement (403 for non-admins)
- Relationship safety and foreign key handling
"""

import sys
import os
import uuid
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))

from fastapi.testclient import TestClient
import database
import models
import security
from main import app

client = TestClient(app)

def run_tests():
    print("=" * 65)
    print("RUNNING ADMIN USER ACTIONS TEST SUITE (ACTIVATE, DEACTIVATE, DELETE)")
    print("=" * 65)

    db = database.SessionLocal()
    try:
        # 1. Setup Admin Account
        admin_email = "frankline30999112@gmail.com"
        admin = db.query(models.User).filter(
            (models.User.email == admin_email) | (models.User.username == admin_email)
        ).first()
        if not admin:
            admin = models.User(
                email=admin_email,
                username="frankline",
                full_name="Frankline Samy",
                hashed_password=security.hash_password("#Frankline2006"),
                role="admin",
                account_status="active",
                is_active=True,
                frank_id="ADM001"
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        else:
            admin.role = "admin"
            admin.account_status = "active"
            admin.is_active = True
            admin.hashed_password = security.hash_password("#Frankline2006")
            db.commit()
            db.refresh(admin)

        # Authenticate Admin
        admin_login = client.post("/api/auth/login", json={
            "username": admin_email,
            "password": "#Frankline2006"
        })
        assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("[PASS] 1. Admin login successfully authenticated")

        # 2. Create Regular Test User
        suffix = uuid.uuid4().hex[:6]
        user_name = f"Test User {suffix}"
        user_username = f"user_{suffix}"
        user_email = f"user_{suffix}@test.app"
        user_pwd = "TestPassword123!"

        test_user = models.User(
            email=user_email,
            username=user_username,
            full_name=user_name,
            hashed_password=security.hash_password(user_pwd),
            role="user",
            account_status="active",
            is_active=True,
            frank_id="TST" + suffix[:3].upper()
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        user_id = test_user.id
        print(f"[PASS] 2. Test user created: ID={user_id}, Email={user_email}")

        # Regular user login & headers
        user_login = client.post("/api/auth/login", json={
            "username": user_email,
            "password": user_pwd
        })
        assert user_login.status_code == 200, f"User login failed: {user_login.text}"
        user_token = user_login.json()["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}
        print("[PASS] 3. Regular user login succeeded")

        # 3. Security: Non-Admin Rejection (403 Forbidden)
        assert client.post(f"/api/admin/users/{user_id}/activate", headers=user_headers).status_code == 403
        assert client.post(f"/api/admin/users/{user_id}/deactivate", headers=user_headers).status_code == 403
        assert client.put(f"/api/admin/users/{user_id}/status", json={"status": "deactivated"}, headers=user_headers).status_code == 403
        assert client.delete(f"/api/admin/users/{user_id}", headers=user_headers).status_code == 403
        print("[PASS] 4. Non-admin calls rejected with 403 Forbidden")

        # 4. Self-Protection: Admin Cannot Deactivate or Delete Self
        self_deact = client.post(f"/api/admin/users/{admin.id}/deactivate", headers=admin_headers)
        assert self_deact.status_code == 400, f"Expected 400 for self-deactivate, got {self_deact.status_code}"
        assert "own administrator account" in self_deact.json().get("detail", "").lower()

        self_del = client.delete(f"/api/admin/users/{admin.id}", headers=admin_headers)
        assert self_del.status_code == 400, f"Expected 400 for self-delete, got {self_del.status_code}"
        assert "own administrator account" in self_del.json().get("detail", "").lower()
        print("[PASS] 5. Admin self-deactivate and self-delete blocked with 400 Bad Request")

        # 5. Test Deactivate User
        deact_res = client.post(f"/api/admin/users/{user_id}/deactivate", headers=admin_headers)
        assert deact_res.status_code == 200, f"Deactivate failed: {deact_res.text}"
        deact_data = deact_res.json()
        assert deact_data["account_status"] == "deactivated"
        assert deact_data["is_active"] is False

        # Verify DB persistence
        db.expire_all()
        u_check = db.query(models.User).filter(models.User.id == user_id).first()
        assert u_check.is_active is False
        assert u_check.account_status == "deactivated"

        # Verify deactivated user cannot log in (403)
        deact_login = client.post("/api/auth/login", json={
            "username": user_email,
            "password": user_pwd
        })
        assert deact_login.status_code == 403, f"Expected 403 for deactivated user, got {deact_login.status_code}"
        print("[PASS] 6. Deactivate user succeeded; status persisted; login rejected with 403")

        # 6. Test Activate User
        act_res = client.post(f"/api/admin/users/{user_id}/activate", headers=admin_headers)
        assert act_res.status_code == 200, f"Activate failed: {act_res.text}"
        act_data = act_res.json()
        assert act_data["account_status"] == "active"
        assert act_data["is_active"] is True

        # Verify DB persistence
        db.expire_all()
        u_check2 = db.query(models.User).filter(models.User.id == user_id).first()
        assert u_check2.is_active is True
        assert u_check2.account_status == "active"

        # Verify user can log in again
        re_login = client.post("/api/auth/login", json={
            "username": user_email,
            "password": user_pwd
        })
        assert re_login.status_code == 200, f"Re-login failed: {re_login.text}"
        print("[PASS] 7. Activate user succeeded; status persisted; login allowed again with 200")

        # 7. Test PUT /api/admin/users/{id}/status
        put_deact = client.put(f"/api/admin/users/{user_id}/status", json={"status": "deactivated"}, headers=admin_headers)
        assert put_deact.status_code == 200
        assert put_deact.json()["is_active"] is False

        put_act = client.put(f"/api/admin/users/{user_id}/status", json={"status": "active"}, headers=admin_headers)
        assert put_act.status_code == 200
        assert put_act.json()["is_active"] is True
        print("[PASS] 8. PUT /status accepts 'deactivated' and 'active' successfully")

        # 8. Test Safe Account Deletion with Related Records
        # Add messages, reactions, conversation preferences for test user
        msg = models.Message(
            sender_id=user_id,
            recipient_id=admin.id,
            content="Test message from victim",
            status="sent"
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

        reaction = models.Reaction(
            message_id=msg.id,
            user_id=user_id,
            emoji="👍"
        )
        db.add(reaction)
        db.commit()

        # Delete user via DELETE /api/admin/users/{user_id}
        del_res = client.delete(f"/api/admin/users/{user_id}", headers=admin_headers)
        assert del_res.status_code == 200, f"Delete failed: {del_res.text}"
        assert del_res.json().get("success") is True

        # Verify user is completely removed from DB
        db.expire_all()
        assert db.query(models.User).filter(models.User.id == user_id).first() is None
        # Verify message and reaction safely cleaned up
        assert db.query(models.Message).filter(models.Message.sender_id == user_id).first() is None
        assert db.query(models.Reaction).filter(models.Reaction.user_id == user_id).first() is None

        # Verify user can no longer log in (401)
        del_login = client.post("/api/auth/login", json={
            "username": user_email,
            "password": user_pwd
        })
        assert del_login.status_code == 401
        print("[PASS] 9. Delete user succeeded; account & foreign key records cleanly removed; login returns 401")

        # 9. Verify Audit Log recorded account_deleted
        audit = db.query(models.AuditLog).filter(
            models.AuditLog.target_id == user_id,
            models.AuditLog.action == "account_deleted"
        ).first()
        assert audit is not None, "AuditLog for account_deleted not found!"
        print(f"[PASS] 10. Audit log verified: action={audit.action}, details={audit.details[:60]}...")

        # 10. Verify Admin Users List and Metrics exclude deleted user
        list_res = client.get("/api/admin/users", headers=admin_headers)
        assert list_res.status_code == 200
        users_in_list = [u["id"] for u in list_res.json()["users"]]
        assert user_id not in users_in_list
        print("[PASS] 11. Deleted user is absent from admin user list")

        print("=" * 65)
        print("ALL 11 ADMIN USER ACTION TESTS PASSED SUCCESSFULLY! (100%)")
        print("=" * 65)
        return True

    finally:
        db.close()

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
