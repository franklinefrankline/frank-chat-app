import os
import sys

# Ensure VERCEL is set
os.environ["VERCEL"] = "1"
os.environ["JWT_SECRET"] = "vercel-test-secret-key-1234567890"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from api.index import app

client = TestClient(app)

def test_vercel_app():
    print("Testing api.index.app under VERCEL environment...")
    
    # 1. Health check or docs
    resp = client.get("/api/auth/me")
    assert resp.status_code in [401, 403], f"Unexpected status: {resp.status_code}"
    print("[PASS] 1. Unauthenticated /api/auth/me returns 401")

    # 2. Register user
    suffix = os.urandom(3).hex()
    reg_payload = {
        "username": f"vercel_user_{suffix}",
        "email": f"vercel_{suffix}@test.com",
        "full_name": "Vercel Test User",
        "password": "Password123!"
    }
    resp = client.post("/api/auth/register", json=reg_payload)
    assert resp.status_code == 201, f"Register failed: {resp.status_code} {resp.text}"
    data = resp.json()
    token = data["access_token"]
    user_id = data["user"]["id"]
    frank_id = data["user"]["frank_id"]
    print(f"[PASS] 2. User registration successful: UserID={user_id}, FRANK ID={frank_id}")

    # 3. Login with credentials
    login_resp = client.post("/api/auth/login", json={
        "username": reg_payload["username"],
        "password": "Password123!"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    print("[PASS] 3. Login with username successful")

    # 4. Upload file in Vercel mode (stored in database/temp)
    file_content = b"This is a test document on Vercel serverless."
    files = {"file": ("test_doc.txt", file_content, "text/plain")}
    headers = {"Authorization": f"Bearer {token}"}
    up_resp = client.post("/api/files/upload", files=files, headers=headers)
    assert up_resp.status_code == 201, f"Upload failed: {up_resp.text}"
    up_data = up_resp.json()
    file_id = up_data["id"]
    print(f"[PASS] 4. File uploaded on Vercel: FileID={file_id}")

    # 5. View document
    view_resp = client.get(f"/api/files/{file_id}/view?token={token}")
    assert view_resp.status_code == 200, f"View failed: {view_resp.status_code}"
    assert "frame-ancestors 'self'" in view_resp.headers.get("Content-Security-Policy", "")
    assert "X-Frame-Options" not in view_resp.headers
    print("[PASS] 5. File view with relaxed frame security headers verified")

    # 6. Admin disable user test
    admin_suffix = os.urandom(3).hex()
    admin_reg = client.post("/api/auth/register", json={
        "username": f"admin_{admin_suffix}",
        "email": f"admin_{admin_suffix}@test.com",
        "full_name": "Admin User",
        "password": "AdminPassword123!"
    })
    assert admin_reg.status_code == 201
    admin_token = admin_reg.json()["access_token"]
    admin_id = admin_reg.json()["user"]["id"]

    db_mod = sys.modules.get("database")
    models_mod = sys.modules.get("models")
    get_db = db_mod.get_db
    User = models_mod.User
    db = next(get_db())
    admin_db_user = db.query(User).filter(User.id == admin_id).first()
    admin_db_user.role = "admin"
    db.commit()

    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Disable user
    dis_resp = client.post(f"/api/admin/users/{user_id}/disable", headers=admin_headers)
    assert dis_resp.status_code == 200, f"Disable failed: {dis_resp.text}"
    print(f"[PASS] 6. Admin disabled user {user_id}")

    # 7. Disabled user login attempt -> 403
    dis_login = client.post("/api/auth/login", json={
        "username": reg_payload["username"],
        "password": "Password123!"
    })
    assert dis_login.status_code == 403, f"Expected 403 for disabled user, got: {dis_login.status_code}"
    assert "Account is disabled" in dis_login.json()["detail"]
    print("[PASS] 7. Disabled user receives 403 on login")

    # 8. Enable user
    en_resp = client.post(f"/api/admin/users/{user_id}/enable", headers=admin_headers)
    assert en_resp.status_code == 200, f"Enable failed: {en_resp.text}"
    print(f"[PASS] 8. Admin re-enabled user {user_id}")

    # 9. Enabled user can login with exact same credentials
    en_login = client.post("/api/auth/login", json={
        "username": reg_payload["username"],
        "password": "Password123!"
    })
    assert en_login.status_code == 200, f"Re-login failed: {en_login.text}"
    print("[PASS] 9. Re-enabled user logged in successfully with preserved credentials")

    print("\n=======================================================")
    print("ALL VERCEL SERVERLESS TESTS PASSED WITH 100% SUCCESS!")
    print("=======================================================")

if __name__ == "__main__":
    test_vercel_app()
