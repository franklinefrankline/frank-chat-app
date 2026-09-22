"""
Test Suite: Permanent Account Persistence, Unique FRANK ID, Auth Case-Insensitivity,
and Attachment Upload/View/Download Flow
"""
import re
import os
import io
import sys
from pathlib import Path

# Add backend directory and root directory to sys.path
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models

client = TestClient(app)

def test_permanent_persistence_and_attachments():
    print("==================================================")
    print("RUNNING PERMANENT PERSISTENCE & ATTACHMENT SUITE")
    print("==================================================")

    # 1. Register a new user with mixed case email
    unique_suffix = os.urandom(4).hex()
    reg_username = f"User_{unique_suffix}"
    reg_email = f"Test_{unique_suffix}@Example.COM"
    reg_pwd = "Password123!"

    reg_res = client.post("/api/auth/register", json={
        "username": reg_username,
        "email": reg_email,
        "full_name": "Test User",
        "password": reg_pwd
    })
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"
    reg_data = reg_res.json()
    user_data = reg_data["user"]
    token = reg_data["access_token"]
    user_id = user_data["id"]
    frank_id = user_data["frank_id"]

    print(f"[PASS] 1. User registered: {reg_username} ({reg_email}), ID: {user_id}")

    # 2. Verify FRANK ID is strictly 6 characters matching [A-Z0-9]{6}
    assert len(frank_id) == 6, f"FRANK ID length is {len(frank_id)}, expected 6"
    assert re.match(r"^[A-Z0-9]{6}$", frank_id), f"FRANK ID {frank_id} does not match [A-Z0-9]{6}"
    print(f"[PASS] 2. FRANK ID format validated: {frank_id} (matches [A-Z0-9]{{6}})")

    # 3. Duplicate registration checks (case-insensitive username and email)
    dup_uname_res = client.post("/api/auth/register", json={
        "username": reg_username.lower(),
        "email": f"diff_{unique_suffix}@example.com",
        "full_name": "Duplicate Username",
        "password": reg_pwd
    })
    assert dup_uname_res.status_code == 400
    assert "Username already taken" in dup_uname_res.json()["detail"]
    print("[PASS] 3a. Case-insensitive duplicate username rejected with 400")

    dup_email_res = client.post("/api/auth/register", json={
        "username": f"diff_{unique_suffix}",
        "email": reg_email.lower(),
        "full_name": "Duplicate Email",
        "password": reg_pwd
    })
    assert dup_email_res.status_code == 400
    assert "An account with this email already exists" in dup_email_res.json()["detail"]
    print("[PASS] 3b. Case-insensitive duplicate email rejected with 400")

    # 4. Case-insensitive login
    login_lower_email = client.post("/api/auth/login", json={
        "username": reg_email.lower(),
        "password": reg_pwd
    })
    assert login_lower_email.status_code == 200, f"Login by lowercase email failed: {login_lower_email.text}"
    print("[PASS] 4a. Login by lowercase email succeeded")

    login_lower_user = client.post("/api/auth/login", json={
        "username": reg_username.lower(),
        "password": reg_pwd
    })
    assert login_lower_user.status_code == 200, f"Login by lowercase username failed: {login_lower_user.text}"
    print("[PASS] 4b. Login by lowercase username succeeded")

    # 5. Database persistence check via separate session
    db = SessionLocal()
    try:
        persisted = db.query(models.User).filter(models.User.id == user_id).first()
        assert persisted is not None
        assert persisted.username == reg_username
        assert persisted.email == reg_email.lower()
        assert persisted.frank_id == frank_id
        assert persisted.account_status == "active"
        print("[PASS] 5. Database persistence verified: user is permanently stored in database")
    finally:
        db.close()

    # 6. Upload an image file via /api/files/upload
    auth_headers = {"Authorization": f"Bearer {token}"}
    fake_img = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200)
    upload_img_res = client.post(
        "/api/files/upload",
        headers=auth_headers,
        files={"file": ("photo_test.jpg", fake_img, "image/jpeg")}
    )
    assert upload_img_res.status_code == 201, f"Image upload failed: {upload_img_res.text}"
    img_data = upload_img_res.json()
    img_id = img_data["id"]
    assert img_data["file_type"] == "image"
    print(f"[PASS] 6a. Photo uploaded successfully: ID={img_id}, filename={img_data['original_filename']}")

    # 7. Upload a PDF document
    fake_pdf = io.BytesIO(b"%PDF-1.4\n%test content\n%%EOF")
    upload_pdf_res = client.post(
        "/api/files/upload",
        headers=auth_headers,
        files={"file": ("report_test.pdf", fake_pdf, "application/pdf")}
    )
    assert upload_pdf_res.status_code == 201, f"PDF upload failed: {upload_pdf_res.text}"
    pdf_data = upload_pdf_res.json()
    pdf_id = pdf_data["id"]
    assert pdf_data["file_type"] == "pdf"
    print(f"[PASS] 7. Document uploaded successfully: ID={pdf_id}, filename={pdf_data['original_filename']}")

    # 8. View and download document
    view_res = client.get(f"/api/files/{pdf_id}/view?token={token}")
    assert view_res.status_code == 200
    assert "inline" in view_res.headers.get("Content-Disposition", "")
    print(f"[PASS] 8a. Document view endpoint returned 200 OK with inline disposition")

    down_res = client.get(f"/api/files/{pdf_id}/download?token={token}")
    assert down_res.status_code == 200
    assert "attachment" in down_res.headers.get("Content-Disposition", "")
    print(f"[PASS] 8b. Document download endpoint returned 200 OK with attachment disposition")

    # 9. Verify Vercel Serverless Function entry point (api/index.py)
    import api.index as vercel_entry
    v_client = TestClient(vercel_entry.app)
    v_health = v_client.get("/api/health")
    assert v_health.status_code == 200
    print("[PASS] 9. Vercel Serverless Function entry point api/index.py works cleanly (health=200)")

    print("==================================================")
    print("ALL TESTS IN PERMANENCE & ATTACHMENTS SUITE PASSED!")
    print("==================================================")

if __name__ == "__main__":
    test_permanent_persistence_and_attachments()
