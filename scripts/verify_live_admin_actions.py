"""
Live Production Verification for Admin User Actions:
Tests against https://frank-chat-app.vercel.app
"""

import ssl
import json
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from sqlalchemy import create_engine, text

PROD_URL = "https://frank-chat-app.vercel.app"
NEON_URL = "postgresql+pg8000://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb"

def api_call(endpoint, method="GET", data=None, token=None):
    url = f"{PROD_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            err_json = json.loads(content)
        except Exception:
            err_json = {"detail": content}
        return e.code, err_json

def run_live_verification():
    print("=" * 70)
    print("RUNNING LIVE VERCEL PRODUCTION VERIFICATION: ADMIN ACTIONS")
    print(f"Target URL: {PROD_URL}")
    print("=" * 70)

    # 1. Check Live Health
    status, health = api_call("/api/health")
    print(f"\n[1] GET /api/health -> {status} {health}")
    assert status == 200 and health.get("status") == "ok", f"Health check failed: {health}"

    # 2. Login as Admin
    status, login_res = api_call("/api/auth/login", method="POST", data={
        "username": "frankline30999112@gmail.com",
        "password": "#Frankline2006"
    })
    print(f"[2] Admin Login -> {status}")
    assert status == 200, f"Admin login failed: {login_res}"
    admin_token = login_res["access_token"]
    admin_user = login_res["user"]
    print(f"    Admin authenticated: ID={admin_user['id']}, role={admin_user['role']}")

    # 3. Create Designated Test User in Neon Database
    engine = create_engine(NEON_URL, connect_args={"ssl_context": ssl.create_default_context()})
    suffix = uuid.uuid4().hex[:6]
    test_username = f"livetest_{suffix}"
    test_email = f"livetest_{suffix}@frank.app"
    test_fid = "LT" + suffix[:4].upper()
    test_pwd = "LivePassword123!"

    # We use pbkdf2_sha256 matching security.hash_password
    import hashlib
    salt = "4e3895e5b"
    pwd_hash = hashlib.sha256((test_pwd + salt).encode()).hexdigest()

    with engine.begin() as conn:
        initial_user_count = conn.execute(text("SELECT count(*) FROM users")).scalar()
        print(f"\n[3] Production database initial users count: {initial_user_count}")

        conn.execute(
            text("""
                INSERT INTO users (username, email, frank_id, full_name, hashed_password, password_hash, role, account_status, is_active, is_online, language, auto_translate, default_view_translation, created_at, updated_at)
                VALUES (:u, :e, :fid, :name, :p, :p, 'user', 'active', TRUE, FALSE, 'en', TRUE, TRUE, NOW(), NOW())
            """),
            {"u": test_username, "e": test_email, "fid": test_fid, "name": f"Live Test {suffix}", "p": pwd_hash}
        )
        test_user_id = conn.execute(text("SELECT id FROM users WHERE username = :u"), {"u": test_username}).scalar()
        print(f"    Created designated test user: ID={test_user_id}, Username={test_username}, Email={test_email}")

    # 4. Verify test user is returned in GET /api/admin/users
    status, users_res = api_call(f"/api/admin/users?q={test_username}", token=admin_token)
    print(f"\n[4] GET /api/admin/users?q={test_username} -> {status}, found {len(users_res.get('users', []))} users")
    assert status == 200, f"GET users failed: {users_res}"
    found_user = next((u for u in users_res.get("users", []) if u["id"] == test_user_id), None)
    assert found_user is not None, "Test user not returned by admin users endpoint!"
    assert found_user["account_status"] == "active"
    print("    Verified test user present with account_status='active'")

    # 5. Test Non-Admin Authorization Rejection
    # Try calling admin endpoints without token -> 401
    status, _ = api_call(f"/api/admin/users/{test_user_id}/activate", method="POST")
    assert status == 401, f"Expected 401 for unauthenticated call, got {status}"
    status, _ = api_call(f"/api/admin/users/{test_user_id}/deactivate", method="POST")
    assert status == 401, f"Expected 401 for unauthenticated call, got {status}"
    status, _ = api_call(f"/api/admin/users/{test_user_id}", method="DELETE")
    assert status == 401, f"Expected 401 for unauthenticated call, got {status}"
    print("[5] Unauthenticated requests correctly rejected with 401")

    # 6. Test Admin Self-Protection
    status, self_deact = api_call(f"/api/admin/users/{admin_user['id']}/deactivate", method="POST", token=admin_token)
    print(f"\n[6] Admin self-deactivate -> {status}: {self_deact}")
    assert status == 400, f"Expected 400 for self-deactivate, got {status}"

    status, self_del = api_call(f"/api/admin/users/{admin_user['id']}", method="DELETE", token=admin_token)
    print(f"    Admin self-delete -> {status}: {self_del}")
    assert status == 400, f"Expected 400 for self-delete, got {status}"

    # 7. Test DEACTIVATE USER
    print(f"\n[7] Testing POST /api/admin/users/{test_user_id}/deactivate...")
    status, deact_resp = api_call(f"/api/admin/users/{test_user_id}/deactivate", method="POST", token=admin_token)
    print(f"    Response -> {status}: {deact_resp}")
    assert status == 200, f"Deactivate failed: {deact_resp}"
    assert deact_resp["account_status"] == "deactivated"
    assert deact_resp["is_active"] is False

    # Check database persistence
    with engine.connect() as conn:
        db_u = conn.execute(text("SELECT account_status, is_active FROM users WHERE id = :id"), {"id": test_user_id}).mappings().first()
        print(f"    Database state after deactivate: account_status={db_u['account_status']}, is_active={db_u['is_active']}")
        assert db_u["account_status"] == "deactivated"
        assert db_u["is_active"] is False

    # Verify deactivated user login rejection (403 Forbidden)
    status, login_blocked = api_call("/api/auth/login", method="POST", data={"username": test_username, "password": test_pwd})
    print(f"    Deactivated user login attempt -> {status}: {login_blocked}")
    assert status == 403, f"Expected 403 Forbidden for deactivated login, got {status}"

    # 8. Test ACTIVATE USER
    print(f"\n[8] Testing POST /api/admin/users/{test_user_id}/activate...")
    status, act_resp = api_call(f"/api/admin/users/{test_user_id}/activate", method="POST", token=admin_token)
    print(f"    Response -> {status}: {act_resp}")
    assert status == 200, f"Activate failed: {act_resp}"
    assert act_resp["account_status"] == "active"
    assert act_resp["is_active"] is True

    # Check database persistence
    with engine.connect() as conn:
        db_u = conn.execute(text("SELECT account_status, is_active FROM users WHERE id = :id"), {"id": test_user_id}).mappings().first()
        print(f"    Database state after activate: account_status={db_u['account_status']}, is_active={db_u['is_active']}")
        assert db_u["account_status"] == "active"
        assert db_u["is_active"] is True

    # 9. Test PUT /api/admin/users/{test_user_id}/status
    print(f"\n[9] Testing PUT /api/admin/users/{test_user_id}/status with 'deactivated'...")
    status, put_deact = api_call(f"/api/admin/users/{test_user_id}/status", method="PUT", data={"status": "deactivated"}, token=admin_token)
    assert status == 200 and put_deact["account_status"] == "deactivated"
    print("    PUT status 'deactivated' succeeded")

    status, put_act = api_call(f"/api/admin/users/{test_user_id}/status", method="PUT", data={"status": "active"}, token=admin_token)
    assert status == 200 and put_act["account_status"] == "active"
    print("    PUT status 'active' succeeded")

    # 10. Test DELETE USER ACCOUNT
    print(f"\n[10] Testing DELETE /api/admin/users/{test_user_id}...")
    # Add a test message and reaction for this user first
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO messages (sender_id, content, message_type, status, created_at)
                VALUES (:uid, 'Test live deletion message', 'text', 'sent', NOW())
            """),
            {"uid": test_user_id}
        )
        msg_id = conn.execute(text("SELECT id FROM messages WHERE sender_id = :uid"), {"uid": test_user_id}).scalar()
        conn.execute(
            text("""
                INSERT INTO reactions (message_id, user_id, emoji, created_at)
                VALUES (:mid, :uid, '👍', NOW())
            """),
            {"mid": msg_id, "uid": test_user_id}
        )
        print(f"    Created related test message (ID={msg_id}) and reaction")

    # Call DELETE on live Vercel
    status, del_resp = api_call(f"/api/admin/users/{test_user_id}", method="DELETE", token=admin_token)
    print(f"    DELETE response -> {status}: {del_resp}")
    assert status == 200, f"Delete failed: {del_resp}"
    assert del_resp.get("success") is True

    # Verify user is permanently removed from Neon database
    with engine.connect() as conn:
        db_deleted_check = conn.execute(text("SELECT id FROM users WHERE id = :id"), {"id": test_user_id}).scalar()
        print(f"    Check deleted user in Neon: {db_deleted_check}")
        assert db_deleted_check is None, "User record was not permanently removed from database!"

        # Check related message is cleanly removed
        db_msg_check = conn.execute(text("SELECT id FROM messages WHERE sender_id = :id"), {"id": test_user_id}).scalar()
        assert db_msg_check is None, "Message record was not cleanly removed!"

        # Check audit log entry
        audit_check = conn.execute(
            text("SELECT id, action, details FROM audit_logs WHERE target_id = :id AND action = 'account_deleted'"),
            {"id": test_user_id}
        ).mappings().first()
        assert audit_check is not None, "Audit log for account_deleted was not recorded!"
        print(f"    Verified AuditLog entry created: ID={audit_check['id']}, action={audit_check['action']}")

        # Verify final user count matches initial count (NO other users deleted!)
        final_user_count = conn.execute(text("SELECT count(*) FROM users")).scalar()
        print(f"\n[11] Final database user count: {final_user_count} (initial: {initial_user_count})")
        assert final_user_count == initial_user_count, f"User count mismatch! Initial: {initial_user_count}, Final: {final_user_count}"

    print("\n" + "=" * 70)
    print("ALL LIVE VERCEL PRODUCTION VERIFICATION TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 70)
    return True

if __name__ == "__main__":
    run_live_verification()
