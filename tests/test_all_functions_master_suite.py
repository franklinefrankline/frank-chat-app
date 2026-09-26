"""
=============================================================================
FRANK CHAT APP - COMPREHENSIVE MASTER FUNCTIONALITY TEST SUITE
=============================================================================
This test suite systematically exercises and verifies ALL functions of FRANK:
1. Authentication, Identity & User Profile
2. Permanent Persistence & Database Integrity
3. Direct Messaging, Self-Chat, Reactions & History
4. Group Management, Membership & Group Messaging
5. File Attachments, Voice Notes & Chunked Uploads
6. Admin Portal, Role-Based Access Control & Audit Logs
7. Health Monitoring, UptimeRobot Endpoints & Performance
=============================================================================
"""

import sys
import os
import io
import time
import json
import uuid
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, engine, Base
import models
import security

client = TestClient(app)

class TestSuiteSummary:
    def __init__(self):
        self.domains = {}
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0

    def record(self, domain, test_name, passed, message=""):
        if domain not in self.domains:
            self.domains[domain] = []
        status_str = "PASS" if passed else "FAIL"
        self.domains[domain].append((test_name, passed, message))
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            print(f"  [PASS] {test_name} {('- ' + message) if message else ''}")
        else:
            self.failed_tests += 1
            print(f"  [FAIL] {test_name} {('- ' + message) if message else ''}")

summary = TestSuiteSummary()

def run_all_tests():
    print("\n" + "=" * 75)
    print("STARTING COMPLETE MASTER FUNCTIONALITY TEST SUITE FOR FRANK")
    print("=" * 75 + "\n")

    db = SessionLocal()

    # Ensure admin user exists for tests
    admin_email = "admin_master@example.com"
    admin_user = db.query(models.User).filter(models.User.email == admin_email).first()
    if not admin_user:
        admin_user = models.User(
            email=admin_email,
            username="admin_master",
            full_name="Master Administrator",
            hashed_password=security.hash_password("AdminPass123!"),
            role="admin",
            account_status="active",
            frank_id="ADMN01"
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
    db.close()

    # Admin Login
    admin_login_res = client.post("/api/auth/login", json={
        "username": admin_email,
        "password": "AdminPass123!"
    })
    admin_token = admin_login_res.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # =========================================================================
    # DOMAIN 1: AUTHENTICATION, IDENTITY & PROFILE
    # =========================================================================
    print("[DOMAIN 1] Testing Authentication, Identity & Profile...")
    d1 = "Authentication & Identity"

    # 1.1 User Registration
    u1_suffix = uuid.uuid4().hex[:6]
    u1_email = f"user1_{u1_suffix}@example.com"
    u1_username = f"user1_{u1_suffix}"
    u1_pass = "SecurePass123!"

    reg1 = client.post("/api/auth/register", json={
        "email": u1_email,
        "username": u1_username,
        "full_name": f"Test User One {u1_suffix}",
        "password": u1_pass
    })
    u1_token = reg1.json().get("access_token")
    u1_data = reg1.json().get("user", {})
    u1_id = u1_data.get("id")
    u1_frank_id = u1_data.get("frank_id")
    u1_headers = {"Authorization": f"Bearer {u1_token}"}

    summary.record(d1, "User Registration", reg1.status_code in (200, 201) and u1_token is not None, f"ID={u1_id}, FRANK_ID={u1_frank_id}")

    # 1.2 FRANK ID Format
    summary.record(d1, "FRANK ID Generation (6 uppercase alphanum)", len(u1_frank_id) == 6 and u1_frank_id.isalnum() and u1_frank_id.isupper())

    # 1.3 Login with Email
    log_email = client.post("/api/auth/login", json={"username": u1_email, "password": u1_pass})
    summary.record(d1, "Login with Email", log_email.status_code == 200 and "access_token" in log_email.json())

    # 1.4 Login with Username
    log_uname = client.post("/api/auth/login", json={"username": u1_username, "password": u1_pass})
    summary.record(d1, "Login with Username", log_uname.status_code == 200 and "access_token" in log_uname.json())

    # 1.5 Login with FRANK ID
    log_fid = client.post("/api/auth/login", json={"username": u1_frank_id, "password": u1_pass})
    summary.record(d1, "Login with FRANK ID", log_fid.status_code == 200 and "access_token" in log_fid.json())

    # 1.6 Invalid Password Rejection
    log_inv = client.post("/api/auth/login", json={"username": u1_email, "password": "WrongPassword!"})
    summary.record(d1, "Invalid Password Rejection (401)", log_inv.status_code == 401)

    # 1.7 Profile Retrieval
    prof_res = client.get("/api/users/profile", headers=u1_headers)
    summary.record(d1, "Profile Retrieval (/api/users/profile)", prof_res.status_code == 200 and prof_res.json().get("email") == u1_email)

    # 1.8 Profile Update
    upd_res = client.put("/api/users/profile", headers=u1_headers, json={
        "full_name": f"Updated Name {u1_suffix}",
        "bio": "Coding with FRANK",
        "custom_status": "Building awesome things"
    })
    summary.record(d1, "Profile Update", upd_res.status_code == 200 and upd_res.json().get("bio") == "Coding with FRANK")

    # 1.9 Search Users
    srch_res = client.get(f"/api/users?q={u1_frank_id}", headers=admin_headers)
    found_u1 = any(u.get("frank_id") == u1_frank_id for u in srch_res.json()) if isinstance(srch_res.json(), list) else False
    summary.record(d1, "Search Users by FRANK ID", srch_res.status_code == 200 and found_u1)

    # =========================================================================
    # DOMAIN 2: PERMANENT DATA PERSISTENCE & DELETION SAFETY
    # =========================================================================
    print("\n[DOMAIN 2] Testing Permanent Data Persistence & Deletion Safety...")
    d2 = "Persistence & Safety"

    # 2.1 Verify User Stored in Database
    db = SessionLocal()
    db_u1 = db.query(models.User).filter(models.User.id == u1_id).first()
    summary.record(d2, "Permanent User Record Committed to Database", db_u1 is not None and db_u1.frank_id == u1_frank_id)
    db.close()

    # 2.2 Re-login maintains exact persistent identity
    rel_res = client.post("/api/auth/login", json={"username": u1_email, "password": u1_pass})
    u1_new_token = rel_res.json().get("access_token")
    u1_new_user = rel_res.json().get("user", {})
    summary.record(d2, "Identity & FRANK ID Preserved Across Logins", u1_new_user.get("id") == u1_id and u1_new_user.get("frank_id") == u1_frank_id)

    # 2.3 Non-admin user cannot delete other users
    u2_suffix = uuid.uuid4().hex[:6]
    reg2 = client.post("/api/auth/register", json={
        "email": f"user2_{u2_suffix}@example.com",
        "username": f"user2_{u2_suffix}",
        "full_name": f"User Two {u2_suffix}",
        "password": "Password123!"
    })
    u2_data = reg2.json()["user"]
    u2_id = u2_data["id"]
    u2_token = reg2.json()["access_token"]
    u2_headers = {"Authorization": f"Bearer {u2_token}"}

    unauth_del = client.delete(f"/api/users/{u2_id}", headers=u1_headers)
    summary.record(d2, "Unauthorized User Deletion Blocked (403)", unauth_del.status_code == 403)

    # 2.4 Non-admin blocked from admin endpoints
    unauth_adm = client.delete(f"/api/admin/users/{u2_id}", headers=u1_headers)
    summary.record(d2, "Non-Admin Calling Admin Deletion Blocked (403)", unauth_adm.status_code == 403)

    # 2.5 Admin Self-Deletion Prevented
    adm_self_del = client.delete(f"/api/admin/users/{admin_user.id}", headers=admin_headers)
    summary.record(d2, "Admin Self-Deletion Blocked (400)", adm_self_del.status_code == 400)

    # 2.6 Admin Deletion of Target User
    adm_del_u2 = client.delete(f"/api/admin/users/{u2_id}", headers=admin_headers)
    summary.record(d2, "Authorized Admin Deletion Succeeded", adm_del_u2.status_code == 200 and adm_del_u2.json().get("success"))

    # 2.7 Verify User is Gone from DB & Login Blocked
    db = SessionLocal()
    u2_check = db.query(models.User).filter(models.User.id == u2_id).first()
    summary.record(d2, "Deleted User Removed from Database", u2_check is None)
    db.close()

    deleted_login = client.post("/api/auth/login", json={"username": f"user2_{u2_suffix}@example.com", "password": "Password123!"})
    summary.record(d2, "Deleted User Login Rejected (401)", deleted_login.status_code == 401)

    # =========================================================================
    # DOMAIN 3: MESSAGING, CONVERSATIONS & REACTIONS
    # =========================================================================
    print("\n[DOMAIN 3] Testing Direct Messaging, Self-Chat & Reactions...")
    d3 = "Messaging & Conversations"

    # Register recipient user
    u3_suffix = uuid.uuid4().hex[:6]
    reg3 = client.post("/api/auth/register", json={
        "email": f"user3_{u3_suffix}@example.com",
        "username": f"user3_{u3_suffix}",
        "full_name": f"User Three {u3_suffix}",
        "password": "Password123!"
    })
    u3_id = reg3.json()["user"]["id"]
    u3_token = reg3.json()["access_token"]
    u3_headers = {"Authorization": f"Bearer {u3_token}"}

    # 3.1 Send Direct Message
    send_msg = client.post("/api/messages", headers=u1_headers, json={
        "recipient_id": u3_id,
        "content": "Hello User 3 from User 1!"
    })
    msg_id = send_msg.json().get("id")
    summary.record(d3, "Send Direct Message", send_msg.status_code in (200, 201) and msg_id is not None, f"MsgID={msg_id}")

    # 3.2 Retrieve Message History
    hist_res = client.get(f"/api/messages/direct/{u3_id}", headers=u1_headers)
    msgs = hist_res.json()
    summary.record(d3, "Retrieve Direct Messages History", hist_res.status_code == 200 and len(msgs) > 0 and msgs[-1]["id"] == msg_id)

    # 3.3 Message Yourself / Self-Chat
    self_msg = client.post("/api/messages", headers=u1_headers, json={
        "recipient_id": u1_id,
        "content": "Self note: Complete all checks!"
    })
    self_msg_id = self_msg.json().get("id")
    summary.record(d3, "Message Yourself (Self-Chat)", self_msg.status_code in (200, 201) and self_msg_id is not None)

    # 3.4 Edit Message
    edit_res = client.put(f"/api/messages/{msg_id}", headers=u1_headers, json={
        "content": "Hello User 3 (Edited Content)"
    })
    summary.record(d3, "Edit Message (Owner)", edit_res.status_code == 200 and edit_res.json().get("content") == "Hello User 3 (Edited Content)")

    # 3.5 Non-owner Cannot Edit Message
    non_owner_edit = client.put(f"/api/messages/{msg_id}", headers=u3_headers, json={
        "content": "Hacked edit attempt"
    })
    summary.record(d3, "Non-Owner Edit Blocked (403)", non_owner_edit.status_code == 403)

    # 3.6 Add Emoji Reaction
    react_res = client.post(f"/api/messages/{msg_id}/reactions", headers=u3_headers, json={
        "emoji": "👍"
    })
    summary.record(d3, "Add Message Reaction", react_res.status_code == 200 and react_res.json().get("emoji") == "👍")

    # 3.7 Toggle/Remove Emoji Reaction
    unreact_res = client.post(f"/api/messages/{msg_id}/reactions", headers=u3_headers, json={
        "emoji": "👍"
    })
    summary.record(d3, "Toggle/Remove Message Reaction", unreact_res.status_code == 200)

    # 3.8 Unified Conversations List
    conv_res = client.get("/api/users/conversations", headers=u1_headers)
    summary.record(d3, "Unified Conversations Stream (/api/users/conversations)", conv_res.status_code == 200 and len(conv_res.json()) > 0)

    # 3.9 Conversation Preferences (Pin & Mute)
    pref_res = client.post("/api/users/conversations/preferences", headers=u1_headers, json={
        "conversation_type": "direct",
        "conversation_id": u3_id,
        "is_pinned": True,
        "is_muted": True
    })
    summary.record(d3, "Update Conversation Preference (Pin & Mute)", pref_res.status_code == 200 and pref_res.json().get("is_pinned"))

    # 3.10 Delete Message (Owner)
    del_msg = client.delete(f"/api/messages/{msg_id}", headers=u1_headers)
    summary.record(d3, "Delete Message (Owner)", del_msg.status_code == 200)

    # =========================================================================
    # DOMAIN 4: GROUP MANAGEMENT & GROUP CHAT
    # =========================================================================
    print("\n[DOMAIN 4] Testing Group Management & Group Chat...")
    d4 = "Groups & Collaboration"

    # 4.1 Create Group
    grp_res = client.post("/api/groups", headers=u1_headers, json={
        "name": f"Master Test Group {u1_suffix}",
        "description": "Functional validation group",
        "member_ids": [u3_id]
    })
    grp_data = grp_res.json()
    grp_id = grp_data.get("id")
    summary.record(d4, "Create Group with Members", grp_res.status_code in (200, 201) and grp_id is not None, f"GroupID={grp_id}")

    # 4.2 List User Groups
    grp_list = client.get("/api/groups", headers=u1_headers)
    found_grp = any(g["id"] == grp_id for g in grp_list.json()) if isinstance(grp_list.json(), list) else False
    summary.record(d4, "List User Groups", grp_list.status_code == 200 and found_grp)

    # 4.3 Send Group Message
    grp_msg = client.post("/api/messages", headers=u1_headers, json={
        "group_id": grp_id,
        "content": "Hello everyone in the Master Test Group!"
    })
    grp_msg_id = grp_msg.json().get("id")
    summary.record(d4, "Send Group Message", grp_msg.status_code in (200, 201) and grp_msg_id is not None)

    # 4.4 Member Retrieves Group Messages
    grp_msgs = client.get(f"/api/groups/{grp_id}/messages", headers=u3_headers)
    summary.record(d4, "Group Member Receives Group Messages", grp_msgs.status_code == 200 and len(grp_msgs.json()) > 0)

    # 4.5 Add Member to Group
    u4_suffix = uuid.uuid4().hex[:6]
    reg4 = client.post("/api/auth/register", json={
        "email": f"user4_{u4_suffix}@example.com",
        "username": f"user4_{u4_suffix}",
        "full_name": f"User Four {u4_suffix}",
        "password": "Password123!"
    })
    u4_id = reg4.json()["user"]["id"]
    add_mbr = client.post(f"/api/groups/{grp_id}/members", headers=u1_headers, json={"user_ids": [u4_id]})
    summary.record(d4, "Add New Group Member", add_mbr.status_code in (200, 201))

    # 4.6 Remove Member from Group
    rem_mbr = client.delete(f"/api/groups/{grp_id}/members/{u4_id}", headers=u1_headers)
    summary.record(d4, "Remove Group Member", rem_mbr.status_code == 200)

    # =========================================================================
    # DOMAIN 5: FILE ATTACHMENTS, VOICE & CHUNKED UPLOADS
    # =========================================================================
    print("\n[DOMAIN 5] Testing File Attachments, Voice & Chunked Uploads...")
    d5 = "Files & Media"

    # 5.1 Document Upload (PDF)
    pdf_bytes = b"%PDF-1.4 test document content for master verification"
    upload_pdf = client.post("/api/files/upload", headers=u1_headers, files={
        "file": ("test_report.pdf", io.BytesIO(pdf_bytes), "application/pdf")
    })
    pdf_doc_id = upload_pdf.json().get("id")
    summary.record(d5, "Upload Document (PDF)", upload_pdf.status_code in (200, 201) and pdf_doc_id is not None)

    # 5.2 Image Upload (PNG)
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    upload_png = client.post("/api/files/upload", headers=u1_headers, files={
        "file": ("avatar.png", io.BytesIO(png_bytes), "image/png")
    })
    png_doc_id = upload_png.json().get("id")
    summary.record(d5, "Upload Image (PNG)", upload_png.status_code in (200, 201) and png_doc_id is not None)

    # 5.3 Voice Note Upload (audio/webm with codec)
    voice_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00"
    upload_voice = client.post("/api/files/upload", headers=u1_headers, files={
        "file": ("voice_memo.webm", io.BytesIO(voice_bytes), "audio/webm; codecs=opus")
    }, data={"duration": "5.2"})
    voice_doc_id = upload_voice.json().get("id")
    summary.record(d5, "Upload Voice Note (Codec-safe audio)", upload_voice.status_code in (200, 201) and voice_doc_id is not None)

    # 5.4 Document Download (Owner)
    dl_res = client.get(f"/api/files/{pdf_doc_id}/download", headers=u1_headers)
    summary.record(d5, "Download Document (Content-Disposition: attachment)", dl_res.status_code == 200 and "attachment" in dl_res.headers.get("content-disposition", ""))

    # 5.5 Document View/Preview (Inline CSP safe)
    view_res = client.get(f"/api/files/{pdf_doc_id}/view", headers=u1_headers)
    summary.record(d5, "View Document Inline (/view endpoint)", view_res.status_code == 200 and "inline" in view_res.headers.get("content-disposition", ""))

    # 5.6 IDOR Protection: Unauthorized User Cannot Access Private Attachment
    unauth_doc = client.get(f"/api/files/{pdf_doc_id}/view", headers=u3_headers)
    summary.record(d5, "IDOR Protection on Private Files (403)", unauth_doc.status_code == 403)

    # 5.7 Chunked Upload Session
    chunk_upload_id = f"chunk_test_{uuid.uuid4().hex[:8]}"
    chunk_data = b"PK\x03\x04" + b"Z" * 1000
    c1_res = client.post("/api/files/upload-chunk", headers=u1_headers, files={
        "chunk": ("chunked_data.zip", io.BytesIO(chunk_data), "application/zip")
    }, data={
        "upload_id": chunk_upload_id,
        "chunk_index": "0",
        "total_chunks": "1",
        "filename": "chunked_data.zip"
    })
    summary.record(d5, "Chunked Upload Pipeline (/upload-chunk)", c1_res.status_code == 200)

    # =========================================================================
    # DOMAIN 6: ADMIN PORTAL, RBAC & AUDIT LOGS
    # =========================================================================
    print("\n[DOMAIN 6] Testing Admin Portal, RBAC & Audit Logs...")
    d6 = "Admin Portal & RBAC"

    # 6.1 Admin Login & Role Verification
    summary.record(d6, "Admin Authentication & Role Verification", admin_user.role == "admin" and admin_token is not None)

    # 6.2 Admin Metrics
    metrics_res = client.get("/api/admin/metrics", headers=admin_headers)
    m_data = metrics_res.json()
    summary.record(d6, "Admin Metrics Dashboard", metrics_res.status_code == 200 and "total_users" in m_data and "active_accounts" in m_data)

    # 6.3 Admin User Management Listing
    u_list = client.get("/api/admin/users", headers=admin_headers)
    summary.record(d6, "Admin User Management List", u_list.status_code == 200 and len(u_list.json()) > 0)

    # 6.4 Disable User Account
    dis_res = client.post(f"/api/admin/users/{u1_id}/disable", headers=admin_headers)
    summary.record(d6, "Disable User Account", dis_res.status_code == 200 and dis_res.json().get("account_status") == "disabled")

    # 6.5 Disabled User Login Blocked
    dis_log = client.post("/api/auth/login", json={"username": u1_email, "password": u1_pass})
    summary.record(d6, "Disabled User Login Blocked (403)", dis_log.status_code == 403)

    # 6.6 Re-enable User Account
    en_res = client.post(f"/api/admin/users/{u1_id}/enable", headers=admin_headers)
    summary.record(d6, "Re-enable User Account", en_res.status_code == 200 and en_res.json().get("account_status") == "active")

    # 6.7 Re-enabled User Can Login Again
    re_en_log = client.post("/api/auth/login", json={"username": u1_email, "password": u1_pass})
    summary.record(d6, "Re-enabled User Login Succeeded", re_en_log.status_code == 200)

    # 6.8 Admin Wipe User Data
    wipe_res = client.delete(f"/api/admin/users/{u1_id}/data", headers=admin_headers)
    summary.record(d6, "Admin Wipe User Data (Preserves Account)", wipe_res.status_code == 200 and wipe_res.json().get("success"))

    # 6.9 Admin Audit Logs Retrieval
    audit_res = client.get("/api/admin/audit-logs", headers=admin_headers)
    summary.record(d6, "Audit Logs Retrieved", audit_res.status_code == 200 and len(audit_res.json()) > 0)

    # =========================================================================
    # DOMAIN 7: HEALTH MONITORING & SYSTEM ENDPOINTS
    # =========================================================================
    print("\n[DOMAIN 7] Testing Health Monitoring & System Endpoints...")
    d7 = "Health & System"

    # 7.1 GET /health
    h_get = client.get("/health")
    summary.record(d7, "GET /health (HTTP 200)", h_get.status_code == 200 and h_get.json().get("status") == "ok")

    # 7.2 HEAD /health
    h_head = client.head("/health")
    summary.record(d7, "HEAD /health (HTTP 200)", h_head.status_code == 200)

    # 7.3 GET /api/health
    api_h_get = client.get("/api/health")
    summary.record(d7, "GET /api/health (HTTP 200)", api_h_get.status_code == 200 and api_h_get.json().get("status") == "ok")

    # 7.4 HEAD /api/health
    api_h_head = client.head("/api/health")
    summary.record(d7, "HEAD /api/health (HTTP 200)", api_h_head.status_code == 200)

    # 7.5 UptimeRobot User-Agent Check
    ur_headers = {"User-Agent": "Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)"}
    ur_res = client.get("/health", headers=ur_headers)
    summary.record(d7, "UptimeRobot User-Agent Handshake", ur_res.status_code == 200 and ur_res.json().get("database") == "connected")

    # 7.6 Self-Deletion via /api/users/me
    self_del = client.delete("/api/users/me", headers=u1_headers)
    summary.record(d7, "User Self-Deletion (DELETE /api/users/me)", self_del.status_code == 200 and self_del.json().get("success"))

    # =========================================================================
    # FINAL SUMMARY REPORT
    # =========================================================================
    print("\n" + "=" * 75)
    print("MASTER TEST SUITE EXECUTION SUMMARY")
    print("=" * 75)
    for domain, tests in summary.domains.items():
        domain_passed = sum(1 for _, p, _ in tests if p)
        print(f"\n{domain:35} : {domain_passed}/{len(tests)} PASSED ({int(domain_passed/len(tests)*100)}%)")
        for name, passed, msg in tests:
            mark = "[OK]  " if passed else "[FAIL]"
            print(f"   {mark} {name}")

    print("\n" + "=" * 75)
    print(f"TOTAL TESTS  : {summary.total_tests}")
    print(f"TOTAL PASSED : {summary.passed_tests}")
    print(f"TOTAL FAILED : {summary.failed_tests}")
    success_rate = (summary.passed_tests / summary.total_tests) * 100
    print(f"SUCCESS RATE : {success_rate:.1f}%")
    print("=" * 75 + "\n")

    return summary.failed_tests == 0

if __name__ == "__main__":
    success = run_all_tests()
    if not success:
        sys.exit(1)
    sys.exit(0)
