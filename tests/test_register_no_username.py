import os
import sys
import uuid
from fastapi.testclient import TestClient

# Ensure backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from main import app
from database import get_db, Base, engine

client = TestClient(app)

def test_register_without_username_and_login_with_email_or_fullname():
    unique_suffix = uuid.uuid4().hex[:6]
    full_name = f"Test User {unique_suffix}"
    email = f"user_{unique_suffix}@frank.app"
    password = "SecurePassword123!"

    # 1. Register without providing username
    reg_payload = {
        "full_name": full_name,
        "email": email,
        "password": password
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code == 201, f"Register failed: {reg_res.text}"
    data = reg_res.json()
    assert "access_token" in data
    assert "user" in data
    user_info = data["user"]
    assert user_info["full_name"] == full_name
    assert user_info["email"] == email
    assert user_info["username"] is not None
    assert len(user_info["username"]) > 0

    # 2. Login using Email
    login_by_email = client.post("/api/auth/login", json={
        "username": email,
        "password": password
    })
    assert login_by_email.status_code == 200, f"Login by email failed: {login_by_email.text}"
    assert "access_token" in login_by_email.json()

    # 3. Login using Full Name
    login_by_fullname = client.post("/api/auth/login", json={
        "username": full_name,
        "password": password
    })
    assert login_by_fullname.status_code == 200, f"Login by full name failed: {login_by_fullname.text}"
    assert "access_token" in login_by_fullname.json()

    # 4. Login using generated username
    login_by_username = client.post("/api/auth/login", json={
        "username": user_info["username"],
        "password": password
    })
    assert login_by_username.status_code == 200, f"Login by generated username failed: {login_by_username.text}"
    assert "access_token" in login_by_username.json()

    # 5. Register second user with identical full_name to test collision & password verification
    email2 = f"user2_{unique_suffix}@frank.app"
    password2 = "DifferentPassword456!"
    reg_payload2 = {
        "full_name": full_name, # Same full name
        "email": email2,
        "password": password2
    }
    reg_res2 = client.post("/api/auth/register", json=reg_payload2)
    assert reg_res2.status_code == 201, f"Register second user failed: {reg_res2.text}"
    user_info2 = reg_res2.json()["user"]
    assert user_info2["username"] != user_info["username"] # Collision avoidance

    # 6. Verify logging in with full_name resolves to the correct user based on password
    login_full1 = client.post("/api/auth/login", json={"username": full_name, "password": password})
    assert login_full1.status_code == 200
    assert login_full1.json()["user"]["email"] == email

    login_full2 = client.post("/api/auth/login", json={"username": full_name, "password": password2})
    assert login_full2.status_code == 200
    assert login_full2.json()["user"]["email"] == email2

    # 7. Invalid password fails with 401
    bad_login = client.post("/api/auth/login", json={"username": full_name, "password": "WrongPassword"})
    assert bad_login.status_code == 401

if __name__ == "__main__":
    test_register_without_username_and_login_with_email_or_fullname()
    print("ALL TESTS PASSED SUCCESSFULLY!")
