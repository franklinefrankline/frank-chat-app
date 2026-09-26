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

def test_database_persistence_and_restart():
    print("==================================================")
    print("RUNNING DATABASE RESTART & PERSISTENCE TEST")
    print("==================================================")

    db = database.SessionLocal()
    try:
        # 1. Query an existing user from the database
        email = "frank_user_108555@example.com"
        user = db.query(models.User).filter(models.User.email == email).first()
        assert user is not None, f"User {email} not found in database!"
        
        orig_id = user.id
        orig_frank_id = user.frank_id
        orig_role = user.role
        orig_status = user.status
        pwd_hash = user.password_hash or user.hashed_password
        
        print(f"[PASS] 1. User verified in DB: ID={orig_id}, Email={email}, FRANK_ID={orig_frank_id}, Status={orig_status}")
        assert orig_frank_id is not None and len(orig_frank_id) == 6
        assert pwd_hash is not None and len(pwd_hash) > 20

        # 2. Simulate server restart: close session, re-instantiate TestClient
        db.close()
        
        # 3. Re-login after simulated restart
        restart_client = TestClient(app)
        login_res = restart_client.post("/api/auth/login", json={
            "email": email.upper(), # Test uppercase email normalization
            "password": "SecurePassword123!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        data = login_res.json()
        assert data["user"]["id"] == orig_id
        assert data["user"]["frank_id"] == orig_frank_id
        print(f"[PASS] 2. Re-login after restart succeeded: Same User ID {orig_id} and same FRANK ID {orig_frank_id}")

        # 4. Check for 24-hour persistence & verify no auto-expiry exists
        # Inspect user columns to confirm no expiration timestamp or auto-delete flag
        assert not hasattr(models.User, "expires_at"), "User model must not have expires_at field"
        assert user.status == "active"
        print("[PASS] 3. Account has no 24-hour expiry logic; account is permanent")

        print("==================================================")
        print("DATABASE RESTART & PERSISTENCE TEST PASSED!")
        print("==================================================")
    finally:
        db.close()

if __name__ == "__main__":
    test_database_persistence_and_restart()
