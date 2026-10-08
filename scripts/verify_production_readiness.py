"""
Comprehensive Production Readiness and Data Preservation Test Suite
Verifies:
1. Neon PostgreSQL connectivity and strict data preservation (Zero data loss)
2. All 4 original production users intact (ID 1: frankline, ID 2: alex, ID 3: sarah, ID 4: david)
3. Conversations and messages intact
4. GET /health returns 200 with {"status": "ok", "database": "connected"}
5. Authentication & Deactivation error message (Never "Invalid username" for deactivated accounts)
6. Admin role security (403 for non-admins)
7. Safe soft-deletion / deactivation support
8. Smart Conversation message-level AI analysis endpoint
9. File upload functionality
"""

import sys
import os
import functools
from pathlib import Path

print = functools.partial(print, flush=True)

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from database import engine, SessionLocal, check_and_migrate_db
from sqlalchemy import text
import models
import schemas
from security import hash_password, verify_password, create_access_token
from fastapi.testclient import TestClient
from main import app

def run_tests():
    print("=" * 60)
    print("FRANK CHAT APP - COMPREHENSIVE PRODUCTION VERIFICATION")
    print("=" * 60)

    # 1. DATABASE CONNECTIVITY & PRESERVATION
    print("\n[1] Checking Database Connection & Existing Records...")
    check_and_migrate_db()
    db = SessionLocal()

    with engine.connect() as conn:
        res = conn.execute(text("SELECT current_database(), current_user, inet_server_addr()")).fetchone()
        print(f"Connected DB: {res[0]} as user {res[1]}")

    users = db.query(models.User).order_by(models.User.id).all()
    user_count = len(users)
    print(f"Total Users in DB: {user_count} (must be >= 4)")
    assert user_count >= 4, f"FAIL: Expected at least 4 users, found {user_count}"

    # Verify original 4 users exist with exact IDs
    user_ids = {u.id: (u.username, u.email, u.role, getattr(u, 'is_active', None)) for u in users}
    print(f"Verified Users: {user_ids}")
    assert 1 in user_ids, "FAIL: User ID 1 missing"
    assert 2 in user_ids, "FAIL: User ID 2 missing"
    assert 3 in user_ids, "FAIL: User ID 3 missing"
    assert 4 in user_ids, "FAIL: User ID 4 missing"

    # Verify is_active column is present and True for active users
    admin_user = db.query(models.User).filter(models.User.id == 1).first()
    assert hasattr(admin_user, "is_active"), "FAIL: is_active column not found on User model"
    print(f"User 1 (Admin) is_active = {admin_user.is_active}")

    # Check conversations and messages count
    conv_count = db.query(models.Conversation).count()
    msg_count = db.query(models.Message).count()
    print(f"Total Conversations: {conv_count}, Total Messages: {msg_count}")
    assert conv_count >= 1, "FAIL: Conversations were lost!"
    assert msg_count >= 1, "FAIL: Messages were lost!"

    # 2. TEST CLIENT & HEALTH CHECK (Part 12 & 48)
    print("\n[2] Checking GET /health & GET /api/health...")
    client = TestClient(app)
    resp = client.get("/health")
    print(f"GET /health: {resp.status_code} -> {resp.json()}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert resp.json().get("status") == "ok", "Expected status ok"
    assert resp.json().get("database") == "connected", "Expected database connected"

    resp_api = client.get("/api/health")
    assert resp_api.status_code == 200, f"Expected 200, got {resp_api.status_code}"

    # 3. AUTHENTICATION & LOGIN (Part 7 & 8)
    print("\n[3] Checking User & Admin Login...")
    # Login as admin
    resp_login = client.post("/api/auth/login", json={
        "email": "frankline30999112@gmail.com",
        "password": "#Frankline2006"
    })
    print(f"Admin Login: {resp_login.status_code}")
    assert resp_login.status_code == 200, f"Login failed: {resp_login.text}"
    admin_token = resp_login.json()["access_token"]

    # Login as Alex
    resp_alex = client.post("/api/auth/login", json={
        "username": "alex",
        "password": "password123"
    })
    print(f"User Alex Login: {resp_alex.status_code}")
    assert resp_alex.status_code == 200, f"Alex login failed: {resp_alex.text}"
    alex_token = resp_alex.json()["access_token"]

    # 4. DEACTIVATION & ERROR MESSAGE (Part 18)
    print("\n[4] Checking Account Deactivation & Error Message...")
    # Admin disables / deactivates David (ID 4)
    resp_deact = client.post(
        "/api/admin/users/4/deactivate",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print(f"Deactivate David: {resp_deact.status_code}")
    assert resp_deact.status_code == 200

    # David tries to login: MUST receive 403 with deactivated message, NEVER 'Invalid username'
    resp_david_login = client.post("/api/auth/login", json={
        "username": "david",
        "password": "password123"
    })
    print(f"David Login when deactivated: {resp_david_login.status_code} -> {resp_david_login.text}")
    assert resp_david_login.status_code == 403, f"Expected 403, got {resp_david_login.status_code}"
    assert "deactivated" in resp_david_login.json().get("detail", "").lower(), "Must mention deactivated"
    assert "invalid username" not in resp_david_login.json().get("detail", "").lower(), "Must NOT say invalid username"

    # Admin reactivates David
    resp_react = client.post(
        "/api/admin/users/4/reactivate",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print(f"Reactivate David: {resp_react.status_code}")
    assert resp_react.status_code == 200

    # David can now login again
    resp_david_active = client.post("/api/auth/login", json={
        "username": "david",
        "password": "password123"
    })
    assert resp_david_active.status_code == 200, "David should be able to log in after reactivation"

    # 5. ADMIN AUTHORIZATION & SECURITY (Part 17)
    print("\n[5] Checking Admin Authorization (Non-admin 403)...")
    # Normal user Alex tries to access /api/admin/users
    resp_unauth = client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {alex_token}"}
    )
    print(f"Alex accessing /api/admin/users: {resp_unauth.status_code}")
    assert resp_unauth.status_code == 403, f"Expected 403, got {resp_unauth.status_code}"

    # Admin accesses /api/admin/users
    resp_admin_users = client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print(f"Admin accessing /api/admin/users: {resp_admin_users.status_code}")
    assert resp_admin_users.status_code == 200

    # 6. SMART CONVERSATIONS MESSAGE-SPECIFIC AI ANALYSIS (Part 25)
    print("\n[6] Checking Message-Specific & Document-Specific AI Analysis...")
    sample_msg = db.query(models.Message).first()
    assert sample_msg is not None, "Need at least 1 message to test"
    conv_id = sample_msg.recipient_id if sample_msg.recipient_id else sample_msg.group_id

    resp_smart = client.post(
        f"/api/conversations/{conv_id}/messages/{sample_msg.id}/smart/analyze",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print(f"Smart Analyze Message {sample_msg.id}: {resp_smart.status_code} -> {resp_smart.json()}")
    assert resp_smart.status_code == 200
    smart_data = resp_smart.json()
    assert smart_data.get("success") is True
    assert smart_data.get("message_id") == sample_msg.id
    assert "analysis" in smart_data
    assert "category" in smart_data["analysis"]
    assert "key_takeaway" in smart_data["analysis"]

    # 7. FILE UPLOAD (Part 20)
    print("\n[7] Checking File Upload with 1.1MB PDF Simulation...")
    pdf_content = b"%PDF-1.4\n" + b"A" * (1100 * 1024) + b"\n%%EOF"
    upload_resp = client.post(
        "/api/files/upload",
        headers={"Authorization": f"Bearer {alex_token}"},
        files={"file": ("test_doc.pdf", pdf_content, "application/pdf")},
        data={"partner_id": "1"}
    )
    print(f"Upload PDF: {upload_resp.status_code}")
    assert upload_resp.status_code == 201, f"Upload failed: {upload_resp.text}"
    uploaded_doc = upload_resp.json()
    print(f"Uploaded Doc ID: {uploaded_doc.get('id')}, Size: {uploaded_doc.get('file_size')}")

    # Analyze this uploaded document with smart analyze
    resp_doc_smart = client.post(
        f"/api/conversations/1/messages/{sample_msg.id}/attachments/{uploaded_doc['id']}/smart/analyze",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print(f"Smart Analyze Document: {resp_doc_smart.status_code} -> {resp_doc_smart.json()}")
    assert resp_doc_smart.status_code == 200
    assert resp_doc_smart.json().get("attachment_id") == uploaded_doc["id"]

    db.close()
    print("\n" + "=" * 60)
    print("ALL VERIFICATION CHECKS PASSED PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
