import sys
import os
import uuid
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

def test_admin_disable_enable_login():
    print("==================================================")
    print("RUNNING ADMIN DISABLE/ENABLE & LOGIN TEST SUITE")
    print("==================================================")

    db = database.SessionLocal()
    try:
        # 1. Ensure Admin exists
        admin_email = "frankline30999112@gmail.com"
        admin_user = db.query(models.User).filter(
            (models.User.email == admin_email) | (models.User.username == admin_email)
        ).first()
        if not admin_user:
            admin_user = models.User(
                email=admin_email,
                username=admin_email,
                full_name="Frankline Admin",
                hashed_password=security.hash_password("#Frankline2006"),
                role="admin",
                account_status="active",
                frank_id="ADM999"
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
        else:
            admin_user.role = "admin"
            admin_user.account_status = "active"
            admin_user.hashed_password = security.hash_password("#Frankline2006")
            db.commit()
            db.refresh(admin_user)

        # Admin login
        admin_res = client.post("/api/auth/login", json={
            "username": admin_email,
            "password": "#Frankline2006"
        })
        assert admin_res.status_code == 200, f"Admin login failed: {admin_res.text}"
        admin_token = admin_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("[PASS] 1. Admin login successfully authenticated")

        # 2. Register fresh test user
        rand_suffix = uuid.uuid4().hex[:6]
        test_username = f"user_{rand_suffix}"
        test_email = f"user_{rand_suffix}@frank.app"
        test_password = "UserPassword123!"

        reg_res = client.post("/api/auth/register", json={
            "username": test_username,
            "email": test_email,
            "password": test_password,
            "full_name": f"User {rand_suffix.upper()}"
        })
        assert reg_res.status_code == 201, f"User registration failed: {reg_res.text}"
        user_data = reg_res.json()["user"]
        user_id = user_data["id"]
        user_frank_id = user_data["frank_id"]
        print(f"[PASS] 2. User created: ID={user_id}, Username={test_username}, FRANK_ID={user_frank_id}")

        # Initial login verify
        login_res = client.post("/api/auth/login", json={
            "username": test_email,
            "password": test_password
        })
        assert login_res.status_code == 200
        print("[PASS] 3. Initial user login succeeded")

        # 3. Admin Disables Account via POST /api/admin/users/{user_id}/disable
        disable_res = client.post(f"/api/admin/users/{user_id}/disable", headers=admin_headers)
        assert disable_res.status_code == 200, f"Disable failed: {disable_res.text}"
        assert disable_res.json()["account_status"] == "disabled"

        # Check Audit Log for ADMIN_DISABLED_USER
        latest_audit = db.query(models.AuditLog).filter(
            models.AuditLog.target_id == user_id,
            models.AuditLog.action == "ADMIN_DISABLED_USER"
        ).first()
        assert latest_audit is not None, "Audit log ADMIN_DISABLED_USER not found!"
        print(f"[PASS] 4. User disabled successfully, audit log recorded: {latest_audit.action}")

        # 4. Disabled user attempts login with correct password -> must get 403 Forbidden
        disabled_login_res = client.post("/api/auth/login", json={
            "username": test_email,
            "password": test_password
        })
        assert disabled_login_res.status_code == 403, f"Expected 403 for disabled user, got {disabled_login_res.status_code}: {disabled_login_res.text}"
        assert "Account is disabled. Please contact an administrator." in disabled_login_res.json()["detail"]
        print("[PASS] 5. Disabled user login correctly blocked with HTTP 403 Forbidden and required message")

        # Disabled user attempts login with WRONG password -> must still get 403 Forbidden
        disabled_wrong_pwd_res = client.post("/api/auth/login", json={
            "username": test_email,
            "password": "WrongPassword999!"
        })
        assert disabled_wrong_pwd_res.status_code == 403, f"Expected 403 for disabled user with wrong password, got {disabled_wrong_pwd_res.status_code}"
        print("[PASS] 6. Disabled user login takes priority over password verification (HTTP 403)")

        # Non-existent user login -> must get 401
        non_existent_res = client.post("/api/auth/login", json={
            "username": f"nonexistent_{uuid.uuid4().hex[:8]}",
            "password": "AnyPassword123!"
        })
        assert non_existent_res.status_code == 401, f"Expected 401 for non-existent user, got {non_existent_res.status_code}"
        print("[PASS] 7. Non-existent user correctly returns HTTP 401 Unauthorized")

        # 5. Admin Enables Account via POST /api/admin/users/{user_id}/enable
        enable_res = client.post(f"/api/admin/users/{user_id}/enable", headers=admin_headers)
        assert enable_res.status_code == 200, f"Enable failed: {enable_res.text}"
        assert enable_res.json()["account_status"] == "active"

        # Check Audit Log for ADMIN_ENABLED_USER
        latest_enable_audit = db.query(models.AuditLog).filter(
            models.AuditLog.target_id == user_id,
            models.AuditLog.action == "ADMIN_ENABLED_USER"
        ).first()
        assert latest_enable_audit is not None, "Audit log ADMIN_ENABLED_USER not found!"
        print(f"[PASS] 8. User enabled successfully, audit log recorded: {latest_enable_audit.action}")

        # 6. User logs in with exact original email and password -> must succeed
        relogin_email_res = client.post("/api/auth/login", json={
            "username": test_email,
            "password": test_password
        })
        assert relogin_email_res.status_code == 200, f"Re-login by email failed: {relogin_email_res.text}"
        relogin_data = relogin_email_res.json()
        assert relogin_data["user"]["id"] == user_id, "User ID changed after enable!"
        assert relogin_data["user"]["frank_id"] == user_frank_id, "FRANK ID changed after enable!"
        assert relogin_data["user"]["account_status"] == "active"
        print("[PASS] 9. Re-login by email succeeded; ID and FRANK ID 100% preserved")

        # User logs in with FRANK ID and password -> must succeed
        relogin_frank_res = client.post("/api/auth/login", json={
            "username": user_frank_id,
            "password": test_password
        })
        assert relogin_frank_res.status_code == 200, f"Re-login by FRANK ID failed: {relogin_frank_res.text}"
        assert relogin_frank_res.json()["user"]["id"] == user_id
        print("[PASS] 10. Re-login by FRANK ID succeeded")

        # User logs in with username and password -> must succeed
        relogin_user_res = client.post("/api/auth/login", json={
            "username": test_username,
            "password": test_password
        })
        assert relogin_user_res.status_code == 200, f"Re-login by username failed: {relogin_user_res.text}"
        assert relogin_user_res.json()["user"]["id"] == user_id
        print("[PASS] 11. Re-login by username succeeded")

        # Verify PUT /api/admin/users/{user_id}/status also works for disable & enable
        put_disable_res = client.put(f"/api/admin/users/{user_id}/status", json={"status": "disabled"}, headers=admin_headers)
        assert put_disable_res.status_code == 200
        assert put_disable_res.json()["account_status"] == "disabled"

        put_enable_res = client.put(f"/api/admin/users/{user_id}/status", json={"status": "active"}, headers=admin_headers)
        assert put_enable_res.status_code == 200
        assert put_enable_res.json()["account_status"] == "active"
        print("[PASS] 12. PUT /status endpoint backward compatibility verified")

        print("==================================================")
        print("ALL ADMIN DISABLE/ENABLE TESTS PASSED SUCCESSFULLY!")
        print("==================================================")

    finally:
        db.close()

if __name__ == "__main__":
    test_admin_disable_enable_login()
