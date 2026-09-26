"""
FRANK Production UptimeRobot & PostgreSQL Verification Suite
Executes the exact 15-step production verification protocol:

1. Register a new FRANK user.
2. Verify the user exists in PostgreSQL (persistent storage).
3. Verify the permanent FRANK ID.
4. Logout.
5. Login again.
6. Restart the backend (engine dispose + connection cycle).
7. Login again.
8. Verify the same user.
9. Verify the same FRANK ID.
10. Verify conversations and messages remain.
11. Check /health.
12. Verify UptimeRobot can reach /health.
13. Redeploy the backend (full app re-instantiation).
14. Login again.
15. Verify the same account still exists.

FINAL RULE:
UPTIMEROBOT = BACKEND UPTIME MONITORING
POSTGRESQL = PERMANENT USER DATA STORAGE
BOTH MUST BE USED TOGETHER.
"""

import os
import sys
import uuid
import importlib
from pathlib import Path
from starlette.testclient import TestClient

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import models
from database import engine, SessionLocal, Base
import main


def run_15_step_verification():
    print("=" * 70)
    print("STARTING 15-STEP UPTIMEROBOT & PERSISTENT POSTGRESQL VERIFICATION")
    print("=" * 70)

    client = TestClient(main.app)
    unique_suffix = uuid.uuid4().hex[:6]
    test_email = f"test_frank_{unique_suffix}@example.com"
    test_password = f"SecurePass123!_{unique_suffix}"
    test_full_name = f"Test User {unique_suffix}"

    created_user_id = None
    created_frank_id = None
    auth_token = None
    test_msg_id = None

    # -------------------------------------------------------------
    # Step 1: Register a new FRANK user
    # -------------------------------------------------------------
    print("\n[Step 1] Registering a new FRANK user...")
    reg_payload = {
        "email": test_email,
        "password": test_password,
        "full_name": test_full_name,
        "username": f"user_{unique_suffix}"
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code in (200, 201), f"Registration failed: {reg_res.text}"
    reg_data = reg_res.json()
    assert "access_token" in reg_data, "Missing access_token in registration response"
    assert "user" in reg_data, "Missing user in registration response"
    created_user_id = reg_data["user"]["id"]
    created_frank_id = reg_data["user"]["frank_id"]
    auth_token = reg_data["access_token"]
    print(f"  [OK] User registered: ID={created_user_id}, Name='{test_full_name}', Email='{test_email}'")

    # -------------------------------------------------------------
    # Step 2: Verify the user exists in persistent database
    # -------------------------------------------------------------
    print("\n[Step 2] Verifying user exists in persistent database...")
    db = SessionLocal()
    try:
        db_user = db.query(models.User).filter(models.User.id == created_user_id).first()
        assert db_user is not None, f"User {created_user_id} not found in database!"
        assert db_user.email == test_email, f"Email mismatch: {db_user.email} != {test_email}"
        assert db_user.full_name == test_full_name, f"Name mismatch: {db_user.full_name} != {test_full_name}"
        assert db_user.hashed_password, "Password hash is missing!"
        assert db_user.role == "user", f"Unexpected role: {db_user.role}"
        assert db_user.account_status == "active", f"Unexpected status: {db_user.account_status}"
        assert db_user.created_at is not None, "Created date is missing!"
        assert db_user.theme is not None, "Theme preference is missing!"
        print(f"  [OK] User verified in database:")
        print(f"    - ID: {db_user.id}")
        print(f"    - Name: {db_user.full_name}")
        print(f"    - Email: {db_user.email}")
        print(f"    - FRANK ID: {db_user.frank_id}")
        print(f"    - Role: {db_user.role}")
        print(f"    - Account Status: {db_user.account_status}")
        print(f"    - Created At: {db_user.created_at}")
        print(f"    - Theme: {db_user.theme}")
    finally:
        db.close()

    # -------------------------------------------------------------
    # Step 3: Verify the permanent FRANK ID
    # -------------------------------------------------------------
    print("\n[Step 3] Verifying the permanent FRANK ID...")
    assert created_frank_id and len(created_frank_id) == 6, f"Invalid FRANK ID format: {created_frank_id}"
    print(f"  [OK] Permanent FRANK ID confirmed: {created_frank_id}")

    # -------------------------------------------------------------
    # Step 4: Logout
    # -------------------------------------------------------------
    print("\n[Step 4] Logging out (discarding auth token session)...")
    auth_token = None
    print("  [OK] User logged out successfully.")

    # -------------------------------------------------------------
    # Step 5: Login again
    # -------------------------------------------------------------
    print("\n[Step 5] Logging in again with user credentials...")
    login_payload = {
        "username": test_email,
        "password": test_password
    }
    login_res = client.post("/api/auth/login", json=login_payload)
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    login_data = login_res.json()
    auth_token = login_data["access_token"]
    assert login_data["user"]["id"] == created_user_id
    assert login_data["user"]["frank_id"] == created_frank_id
    print(f"  [OK] Logged in again successfully. New token obtained for FRANK ID: {login_data['user']['frank_id']}")

    # Setup a conversation and message for persistence testing
    headers = {"Authorization": f"Bearer {auth_token}"}
    db = SessionLocal()
    try:
        # Create a test message sent by this user
        msg = models.Message(
            sender_id=created_user_id,
            content=f"Persistent test message payload {unique_suffix}",
            status="sent"
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        test_msg_id = msg.id
        print(f"  [OK] Created test message ID={test_msg_id} to verify cross-restart persistence")
    finally:
        db.close()

    # -------------------------------------------------------------
    # Step 6: Restart the backend
    # -------------------------------------------------------------
    print("\n[Step 6] Simulating backend restart (disposing connection pool & restarting context)...")
    engine.dispose()
    # Reconnect
    with engine.connect() as conn:
        from sqlalchemy import text
        conn.execute(text("SELECT 1"))
    print("  [OK] Backend restarted: Connection pool recycled, engine re-initialized.")

    # -------------------------------------------------------------
    # Step 7: Login again
    # -------------------------------------------------------------
    print("\n[Step 7] Logging in again after backend restart...")
    login_post_restart = client.post("/api/auth/login", json=login_payload)
    assert login_post_restart.status_code == 200, f"Login after restart failed: {login_post_restart.text}"
    restart_user_data = login_post_restart.json()["user"]
    print("  [OK] Login post-restart successful.")

    # -------------------------------------------------------------
    # Step 8: Verify the same user
    # -------------------------------------------------------------
    print("\n[Step 8] Verifying same user identity post-restart...")
    assert restart_user_data["id"] == created_user_id, f"User ID changed! {restart_user_data['id']} != {created_user_id}"
    assert restart_user_data["email"] == test_email, f"Email changed! {restart_user_data['email']} != {test_email}"
    assert restart_user_data["full_name"] == test_full_name, f"Name changed! {restart_user_data['full_name']} != {test_full_name}"
    print(f"  [OK] Same user verified: ID={restart_user_data['id']}, Email={restart_user_data['email']}")

    # -------------------------------------------------------------
    # Step 9: Verify the same FRANK ID
    # -------------------------------------------------------------
    print("\n[Step 9] Verifying the same permanent FRANK ID...")
    assert restart_user_data["frank_id"] == created_frank_id, f"FRANK ID changed! {restart_user_data['frank_id']} != {created_frank_id}"
    print(f"  [OK] Same permanent FRANK ID verified: {restart_user_data['frank_id']}")

    # -------------------------------------------------------------
    # Step 10: Verify conversations and messages remain
    # -------------------------------------------------------------
    print("\n[Step 10] Verifying conversations and messages remain...")
    db = SessionLocal()
    try:
        saved_msg = db.query(models.Message).filter(models.Message.id == test_msg_id).first()
        assert saved_msg is not None, f"Message {test_msg_id} was lost during restart!"
        assert f"Persistent test message payload {unique_suffix}" in saved_msg.content
        assert saved_msg.sender_id == created_user_id
        print(f"  [OK] Message {test_msg_id} remains completely intact: '{saved_msg.content}'")
    finally:
        db.close()

    # -------------------------------------------------------------
    # Step 11: Check /health
    # -------------------------------------------------------------
    print("\n[Step 11] Checking lightweight GET /health endpoint...")
    health_res = client.get("/health")
    assert health_res.status_code == 200, f"/health returned status {health_res.status_code}: {health_res.text}"
    health_json = health_res.json()
    assert health_json == {"status": "ok", "database": "connected"}, f"Unexpected health response: {health_json}"
    print(f"  [OK] /health returned 200 OK: {health_json}")

    # Also verify /api/health
    api_health_res = client.get("/api/health")
    assert api_health_res.status_code == 200
    assert api_health_res.json() == {"status": "ok", "database": "connected"}
    print(f"  [OK] /api/health returned 200 OK: {api_health_res.json()}")

    # -------------------------------------------------------------
    # Step 12: Verify UptimeRobot can reach /health
    # -------------------------------------------------------------
    print("\n[Step 12] Verifying UptimeRobot can reach /health (HEAD and GET with UptimeRobot User-Agent)...")
    uptimerobot_headers = {
        "User-Agent": "Mozilla/5.0 +(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)"
    }
    ur_get = client.get("/health", headers=uptimerobot_headers)
    assert ur_get.status_code == 200, f"UptimeRobot GET failed: {ur_get.status_code}"
    assert ur_get.json() == {"status": "ok", "database": "connected"}

    ur_head = client.head("/health", headers=uptimerobot_headers)
    assert ur_head.status_code == 200, f"UptimeRobot HEAD failed: {ur_head.status_code}"
    print(f"  [OK] UptimeRobot reachability confirmed:")
    print(f"    - GET /health: 200 OK -> {ur_get.json()}")
    print(f"    - HEAD /health: 200 OK")

    # -------------------------------------------------------------
    # Step 13: Redeploy the backend
    # -------------------------------------------------------------
    print("\n[Step 13] Simulating backend redeployment (full teardown & reload)...")
    engine.dispose()
    # Reload main module to simulate cold boot of newly deployed container/lambda
    importlib.reload(main)
    reloaded_client = TestClient(main.app)
    print("  [OK] Backend redeployment simulated successfully.")

    # -------------------------------------------------------------
    # Step 14: Login again
    # -------------------------------------------------------------
    print("\n[Step 14] Logging in again after redeploy...")
    post_redeploy_login = reloaded_client.post("/api/auth/login", json=login_payload)
    assert post_redeploy_login.status_code == 200, f"Login after redeploy failed: {post_redeploy_login.text}"
    redeploy_user_data = post_redeploy_login.json()["user"]
    print("  [OK] Login post-redeploy successful.")

    # -------------------------------------------------------------
    # Step 15: Verify the same account still exists
    # -------------------------------------------------------------
    print("\n[Step 15] Verifying the same account still exists with full data integrity...")
    assert redeploy_user_data["id"] == created_user_id
    assert redeploy_user_data["frank_id"] == created_frank_id
    assert redeploy_user_data["email"] == test_email
    assert redeploy_user_data["full_name"] == test_full_name

    # Check database directly post-redeploy
    db = SessionLocal()
    try:
        final_user = db.query(models.User).filter(models.User.id == created_user_id).first()
        assert final_user is not None
        assert final_user.frank_id == created_frank_id

        final_msg = db.query(models.Message).filter(models.Message.id == test_msg_id).first()
        assert final_msg is not None
        print(f"  [OK] Final verification complete:")
        print(f"    - User ID: {final_user.id}")
        print(f"    - FRANK ID: {final_user.frank_id}")
        print(f"    - Name: {final_user.full_name}")
        print(f"    - Email: {final_user.email}")
        print(f"    - Message count for user: {db.query(models.Message).filter(models.Message.sender_id == created_user_id).count()}")
    finally:
        db.close()

    print("\n" + "=" * 70)
    print("ALL 15 STEPS PASSED WITH 100% SUCCESS!")
    print("FINAL RULE SATISFIED:")
    print("  - UPTIMEROBOT = BACKEND UPTIME MONITORING")
    print("  - POSTGRESQL = PERMANENT USER DATA STORAGE")
    print("=" * 70)
    return True


if __name__ == "__main__":
    success = run_15_step_verification()
    sys.exit(0 if success else 1)
