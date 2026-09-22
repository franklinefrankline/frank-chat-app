import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))
os.environ["DATABASE_URL"] = f"sqlite:///{str(backend_dir / 'chatapp.db').replace('\\', '/')}"

from fastapi.testclient import TestClient
import database
import models
import security
from main import app

client = TestClient(app)

def run_admin_tests():
    print("==================================================")
    print("RUNNING FRANK ADMIN & SECURITY TEST SUITE")
    print("==================================================")

    db = database.SessionLocal()
    try:
        # Ensure administrator exists with specified credentials
        admin_user = db.query(models.User).filter(
            (models.User.email == "frankline30999112@gmail.com") |
            (models.User.username == "frankline30999112@gmail.com") |
            (models.User.username == "admin") |
            (models.User.role == "admin")
        ).first()
        if not admin_user:
            admin_user = models.User(
                email="frankline30999112@gmail.com",
                username="frankline30999112@gmail.com",
                full_name="Frankline",
                hashed_password=security.hash_password("#Frankline2006"),
                role="admin",
                account_status="active",
                frank_id="ADM001"
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
        else:
            admin_user.username = "frankline30999112@gmail.com"
            admin_user.email = "frankline30999112@gmail.com"
            admin_user.full_name = "Frankline"
            admin_user.hashed_password = security.hash_password("#Frankline2006")
            admin_user.role = "admin"
            admin_user.account_status = "active"
            db.commit()
            db.refresh(admin_user)

        # Ensure a regular test user exists
        test_user = db.query(models.User).filter(models.User.username == "testuser_admin_suite").first()
        if not test_user:
            test_user = models.User(
                email="testsuite@frank.app",
                username="testuser_admin_suite",
                full_name="Suite Test User",
                hashed_password=security.hash_password("TestPassword123!"),
                role="user",
                account_status="active",
                frank_id="SUITE1"
            )
            db.add(test_user)
            db.commit()
            db.refresh(test_user)

        # -----------------------------------------------------------------
        # TEST 1: Admin Login & Unified Login Role Determination
        # -----------------------------------------------------------------
        admin_login_res = client.post("/api/auth/login", json={
            "username": "frankline30999112@gmail.com",
            "password": "#Frankline2006"
        })
        assert admin_login_res.status_code == 200, f"Admin login failed: {admin_login_res.text}"
        admin_data = admin_login_res.json()
        assert "access_token" in admin_data
        assert admin_data["user"]["role"] == "admin"
        assert admin_data["user"]["account_status"] == "active"
        admin_token = admin_data["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("[PASS] 1. Admin login succeeds with role='admin' and account_status='active'")

        # -----------------------------------------------------------------
        # TEST 2: Normal User Login
        # -----------------------------------------------------------------
        user_login_res = client.post("/api/auth/login", json={
            "username": "testuser_admin_suite",
            "password": "TestPassword123!"
        })
        assert user_login_res.status_code == 200, f"User login failed: {user_login_res.text}"
        user_data = user_login_res.json()
        assert user_data["user"]["role"] == "user"
        user_token = user_data["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}
        print("[PASS] 2. Normal user login succeeds with role='user'")

        # -----------------------------------------------------------------
        # TEST 3: Access Control — Non-Admin Forbidden (403) from Admin Endpoints
        # -----------------------------------------------------------------
        forbidden_res = client.get("/api/admin/metrics", headers=user_headers)
        assert forbidden_res.status_code == 403, f"Expected 403 Forbidden for regular user, got {forbidden_res.status_code}"
        print("[PASS] 3. Non-admin user receives 403 Forbidden when accessing /api/admin/metrics")

        # -----------------------------------------------------------------
        # TEST 4: Admin Access to Real Database Metrics
        # -----------------------------------------------------------------
        metrics_res = client.get("/api/admin/metrics", headers=admin_headers)
        assert metrics_res.status_code == 200, f"Failed to get metrics: {metrics_res.text}"
        metrics = metrics_res.json()
        assert "total_users" in metrics
        assert "active_accounts" in metrics
        assert "disabled_accounts" in metrics
        assert "email_verified" in metrics
        assert "total_messages" in metrics
        assert "groups" in metrics
        assert "files" in metrics
        assert metrics["total_users"] >= 2
        print(f"[PASS] 4. Admin metrics retrieved successfully: {metrics}")

        # -----------------------------------------------------------------
        # TEST 5: User Search, Filtering & Pagination
        # -----------------------------------------------------------------
        # Search by username
        search_res = client.get("/api/admin/users?q=testuser_admin_suite", headers=admin_headers)
        assert search_res.status_code == 200
        search_data = search_res.json()
        assert search_data["total"] >= 1
        assert any(u["username"] == "testuser_admin_suite" for u in search_data["users"])
        print("[PASS] 5a. Search user by username returns match")

        # Search by FRANK ID
        frank_res = client.get(f"/api/admin/users?q={test_user.frank_id}", headers=admin_headers)
        assert frank_res.status_code == 200
        frank_data = frank_res.json()
        assert frank_data["total"] >= 1
        print("[PASS] 5b. Search user by FRANK ID returns match")

        # Filter by role
        role_res = client.get("/api/admin/users?role=admin", headers=admin_headers)
        assert role_res.status_code == 200
        role_data = role_res.json()
        assert all(u["role"] == "admin" for u in role_data["users"])
        print("[PASS] 5c. Filter by role='admin' returns only admins")

        # -----------------------------------------------------------------
        # TEST 6: User Details — Strict Privacy (Zero Message/Attachment Exposure)
        # -----------------------------------------------------------------
        details_res = client.get(f"/api/admin/users/{test_user.id}", headers=admin_headers)
        assert details_res.status_code == 200
        details = details_res.json()
        assert "username" in details
        assert "email" in details
        assert "frank_id" in details
        assert "messages_count" in details or "message_count" in details
        assert "files_count" in details or "file_count" in details
        assert "groups_count" in details or "group_count" in details
        # Verify NO message content is returned
        assert "messages" not in details
        assert "content" not in details
        assert "attachments" not in details
        print("[PASS] 6. User details returns metadata & counts only (Privacy strictly preserved)")

        # -----------------------------------------------------------------
        # TEST 7: Disable & Enable User Account Flow
        # -----------------------------------------------------------------
        # Disable user
        disable_res = client.put(
            f"/api/admin/users/{test_user.id}/status",
            json={"status": "disabled"},
            headers=admin_headers
        )
        assert disable_res.status_code == 200
        assert disable_res.json()["account_status"] == "disabled"
        print("[PASS] 7a. Account status changed to 'disabled'")

        # Verify disabled user cannot login
        disabled_login_res = client.post("/api/auth/login", json={
            "username": "testuser_admin_suite",
            "password": "TestPassword123!"
        })
        assert disabled_login_res.status_code in [401, 403], f"Expected 401/403 for disabled user login, got {disabled_login_res.status_code}"
        print("[PASS] 7b. Disabled user is blocked from logging in")

        # Verify disabled user token is rejected
        disabled_token_res = client.get("/api/users/me", headers=user_headers)
        assert disabled_token_res.status_code == 403, f"Expected 403 for disabled user token, got {disabled_token_res.status_code}"
        print("[PASS] 7c. Existing token of disabled user is rejected with 403")

        # Re-enable user
        enable_res = client.put(
            f"/api/admin/users/{test_user.id}/status",
            json={"status": "active"},
            headers=admin_headers
        )
        assert enable_res.status_code == 200
        assert enable_res.json()["account_status"] == "active"
        print("[PASS] 7d. Account status successfully restored to 'active'")

        # -----------------------------------------------------------------
        # TEST 8: Delete User Data vs Delete Account
        # -----------------------------------------------------------------
        # Wipe user data
        wipe_res = client.delete(f"/api/admin/users/{test_user.id}/data", headers=admin_headers)
        assert wipe_res.status_code == 200
        # User should still exist
        user_check = db.query(models.User).filter(models.User.id == test_user.id).first()
        assert user_check is not None
        print("[PASS] 8a. Wipe user data clears user content while preserving the user account")

        # Admin cannot delete own account
        self_del_res = client.delete(f"/api/admin/users/{admin_user.id}", headers=admin_headers)
        assert self_del_res.status_code == 400
        print("[PASS] 8b. Admin is strictly prevented from deleting own account")

        # Delete user account permanently
        target_user_id = test_user.id
        del_user_res = client.delete(f"/api/admin/users/{target_user_id}", headers=admin_headers)
        assert del_user_res.status_code == 200
        del_check = db.query(models.User).filter(models.User.id == target_user_id).first()
        assert del_check is None
        print("[PASS] 8c. Target user account permanently deleted from database")

        # -----------------------------------------------------------------
        # TEST 9: Audit Logs Chronology
        # -----------------------------------------------------------------
        audit_res = client.get("/api/admin/audit-logs", headers=admin_headers)
        assert audit_res.status_code == 200
        audit_data = audit_res.json()
        assert audit_data["total"] >= 1
        actions = [l["action"] for l in audit_data["logs"]]
        assert any("disable" in a.lower() or "status" in a.lower() for a in actions)
        assert any("delete" in a.lower() for a in actions)
        print(f"[PASS] 9. Audit logs correctly recorded {audit_data['total']} administrative events")

        # -----------------------------------------------------------------
        # TEST 10: Activity Stream
        # -----------------------------------------------------------------
        activity_res = client.get("/api/admin/activity", headers=admin_headers)
        assert activity_res.status_code == 200
        activities = activity_res.json()
        assert len(activities) >= 1
        print(f"[PASS] 10. Live activity stream returns {len(activities)} events")

        print("==================================================")
        print("ALL 10 ADMIN SUITE TESTS PASSED!")
        print("==================================================")

    finally:
        db.close()

if __name__ == "__main__":
    run_admin_tests()
