import pytest
import os
import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure backend directory is in path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from main import app
from database import get_db, SessionLocal
import models
from security import hash_password, create_access_token
from datetime import timedelta

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def test_user(db_session):
    email = "persistent_user_test@frank.app"
    user = db_session.query(models.User).filter(models.User.email == email).first()
    if not user:
        now_dt = models.get_utc_now()
        pw_hash = hash_password("SecurePass123!")
        user = models.User(
            username="persistent_user_test",
            email=email,
            frank_id="PST001",
            full_name="Persistent User",
            name="Persistent User",
            hashed_password=pw_hash,
            password_hash=pw_hash,
            role="user",
            account_status="active",
            status="active",
            is_active=True,
            created_at=now_dt,
            updated_at=now_dt
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user

def test_login_returns_token_and_sets_cookie(test_user):
    resp = client.post("/api/auth/login", json={
        "email": test_user.email,
        "password": "SecurePass123!"
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == test_user.email
    assert "frank_token" in resp.cookies
    assert resp.cookies["frank_token"] == data["access_token"]

def test_get_me_with_bearer_token(test_user):
    # Obtain token
    resp = client.post("/api/auth/login", json={
        "email": test_user.email,
        "password": "SecurePass123!"
    })
    token = resp.json()["access_token"]

    # Call /api/auth/me with Bearer token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["id"] == test_user.id
    assert me_resp.json()["email"] == test_user.email

def test_get_me_with_cookie(test_user):
    # Obtain token
    resp = client.post("/api/auth/login", json={
        "email": test_user.email,
        "password": "SecurePass123!"
    })
    token = resp.json()["access_token"]

    # Call /api/auth/me without Authorization header but with frank_token cookie
    client_cookies = {"frank_token": token}
    me_resp = client.get("/api/auth/me", cookies=client_cookies)
    assert me_resp.status_code == 200
    assert me_resp.json()["id"] == test_user.id
    assert me_resp.json()["email"] == test_user.email

def test_get_me_expired_token(test_user):
    # Create expired token (-10 minutes)
    expired_token = create_access_token(
        data={"sub": test_user.username, "user_id": test_user.id, "email": test_user.email},
        expires_delta=timedelta(minutes=-10)
    )
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp.status_code == 401

def test_logout_endpoint_deletes_cookies():
    # Call logout
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    # Check that frank_token is either deleted or expired
    cookie_header = resp.headers.get("set-cookie", "")
    assert 'frank_token=""' in cookie_header or "Max-Age=0" in cookie_header

def test_deactivated_user_forbidden(db_session):
    email = "deactivated_user_test@frank.app"
    user = db_session.query(models.User).filter(models.User.email == email).first()
    if not user:
        now_dt = models.get_utc_now()
        pw_hash = hash_password("Pass123!")
        user = models.User(
            username="deactivated_user_test",
            email=email,
            frank_id="PST002",
            full_name="Deactivated User",
            name="Deactivated User",
            hashed_password=pw_hash,
            password_hash=pw_hash,
            role="user",
            account_status="deactivated",
            status="inactive",
            is_active=False,
            created_at=now_dt,
            updated_at=now_dt
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "email": user.email}
    )
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "deactivated" in resp.json()["detail"].lower()

