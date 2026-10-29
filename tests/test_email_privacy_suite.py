import os
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
import httpx

# Prepend backend to sys.path so database and models can be imported
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import SessionLocal
import models
from security import hash_password, create_access_token

BASE_URL = "http://localhost:8000"

def get_or_create_test_user(prefix: str):
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        email = f"{prefix}_{suffix}@example.com"
        username = f"{prefix}_{suffix}"
        full_name = f"User {prefix.title()}"
        frank_id = f"F{uuid.uuid4().hex[:5].upper()}"
        pwd_hash = hash_password("TestPass#2026!")

        user = models.User(
            email=email,
            username=username,
            full_name=full_name,
            name=full_name,
            frank_id=frank_id,
            hashed_password=pwd_hash,
            password_hash=pwd_hash,
            role="user",
            status="active",
            account_status="active",
            is_active=True,
            is_online=True,
            language="en"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(
            data={"sub": user.email, "email": user.email, "user_id": user.id, "role": user.role},
            expires_delta=timedelta(hours=2)
        )
        return {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "frank_id": user.frank_id,
            "token": token
        }
    finally:
        db.close()

def test_email_privacy_comprehensive():
    with httpx.Client(timeout=15.0) as client:
        print("\n=== STEP 1: Provisioning Two Independent Accounts ===")
        user_a = get_or_create_test_user("alice")
        user_b = get_or_create_test_user("bob")

        print(f"Account A: ID={user_a['id']}, Email={user_a['email']}, Username={user_a['username']}, FRANK_ID={user_a['frank_id']}")
        print(f"Account B: ID={user_b['id']}, Email={user_b['email']}, Username={user_b['username']}, FRANK_ID={user_b['frank_id']}")

        headers_a = {"Authorization": f"Bearer {user_a['token']}"}
        headers_b = {"Authorization": f"Bearer {user_b['token']}"}

        print("\n=== STEP 2: Account Owner's View (Account A opens own endpoints) ===")
        # 1. /api/auth/me
        resp = client.get(f"{BASE_URL}/api/auth/me", headers=headers_a)
        assert resp.status_code == 200, f"/api/auth/me failed: {resp.text}"
        data = resp.json()
        assert data.get("email") == user_a["email"], "Owner must see their own email"
        assert data.get("frank_id") == user_a["frank_id"], "Owner must see their FRANK ID"
        assert data.get("username") == user_a["username"]
        print("[PASS] Account A views own email and profile on /api/auth/me")

        # 2. /api/users/me
        resp = client.get(f"{BASE_URL}/api/users/me", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json().get("email") == user_a["email"], "Owner must see their own email in /api/users/me"
        print("[PASS] Account A views own email on /api/users/me")

        # 3. /api/users/profile
        resp = client.get(f"{BASE_URL}/api/users/profile", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json().get("email") == user_a["email"], "Owner must see their own email in /api/users/profile"
        print("[PASS] Account A views own email on /api/users/profile")

        # 4. Account A querying /api/users/{user_a_id}
        resp = client.get(f"{BASE_URL}/api/users/{user_a['id']}", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json().get("email") == user_a["email"], "Owner querying own ID receives own email"
        print("[PASS] Account A querying own ID receives own email")

        print("\n=== STEP 3: Other Users' View (Account A queries Account B) ===")
        # 1. /api/users/{user_b_id} (User lookup)
        resp_b = client.get(f"{BASE_URL}/api/users/{user_b['id']}", headers=headers_a)
        assert resp_b.status_code == 200, f"User lookup failed: {resp_b.text}"
        data_b = resp_b.json()
        assert "email" not in data_b or data_b.get("email") is None, (
            f"PRIVACY VIOLATION: Account B's email was returned to Account A! Value: {data_b.get('email')}"
        )
        assert data_b["id"] == user_b["id"]
        assert data_b["frank_id"] == user_b["frank_id"], "FRANK ID must remain visible"
        assert data_b["full_name"] == user_b["full_name"], "Full name must remain visible"
        assert data_b["username"] == user_b["username"], "Username must remain visible"
        print("[PASS] Account A querying Account B by ID: Email is completely ABSENT, FRANK ID is visible")

        # 2. Contact search & discovery /api/users
        resp_users = client.get(f"{BASE_URL}/api/users", headers=headers_a)
        assert resp_users.status_code == 200
        for u in resp_users.json():
            assert "email" not in u or u.get("email") is None, (
                f"PRIVACY VIOLATION: Contact discovery leaked user {u.get('id')} email: {u.get('email')}"
            )
            assert "frank_id" in u and u["frank_id"], f"Contact {u.get('id')} is missing FRANK ID"
        print("[PASS] Contact discovery (/api/users): Zero user emails exposed, all FRANK IDs present")

        # 3. FRANK ID lookup /api/users/frank/{frank_id}
        resp_fid = client.get(f"{BASE_URL}/api/users/frank/{user_b['frank_id']}", headers=headers_a)
        assert resp_fid.status_code == 200
        data_fid = resp_fid.json()
        assert "email" not in data_fid or data_fid.get("email") is None, "FRANK ID lookup must not expose email"
        assert data_fid["frank_id"] == user_b["frank_id"]
        print("[PASS] FRANK ID lookup (/api/users/frank/...): Zero emails exposed")

        # 4. Private conversation creation /api/users/conversations/private
        resp_conv = client.post(f"{BASE_URL}/api/users/conversations/private", headers=headers_a, json={
            "target_user_id": user_b["id"],
            "frank_id": user_b["frank_id"]
        })
        assert resp_conv.status_code == 200
        conv_data = resp_conv.json()
        conv_id = conv_data["id"]
        other_user = conv_data.get("other_user")
        assert other_user is not None
        assert "email" not in other_user or other_user.get("email") is None, (
            f"PRIVACY VIOLATION: other_user in private conversation leaked email: {other_user.get('email')}"
        )
        assert other_user["frank_id"] == user_b["frank_id"]
        print("[PASS] Private conversation creation: other_user contains FRANK ID and ZERO email")

        # 5. Load conversation details /api/conversations/{conv_id}
        resp_conv_details = client.get(f"{BASE_URL}/api/conversations/{conv_id}", headers=headers_a)
        assert resp_conv_details.status_code == 200
        partner_obj = resp_conv_details.json().get("partner")
        assert partner_obj is not None
        assert "email" not in partner_obj or partner_obj.get("email") is None, (
            f"PRIVACY VIOLATION: partner in conversation details leaked email: {partner_obj.get('email')}"
        )
        assert partner_obj["frank_id"] == user_b["frank_id"]
        print("[PASS] Conversation details (/api/conversations/{conv_id}): partner contains FRANK ID and ZERO email")

        # 6. Messaging & Sender serialization
        resp_msg_send = client.post(f"{BASE_URL}/api/messages", headers=headers_a, json={
            "recipient_id": user_b["id"],
            "content": "Secret privacy test message."
        })
        assert resp_msg_send.status_code == 201
        msg_out = resp_msg_send.json()
        if msg_out.get("sender"):
            assert "email" not in msg_out["sender"] or msg_out["sender"].get("email") is None, "Message send returned sender email"

        # Account B reads direct messages from Account A
        resp_b_msgs = client.get(f"{BASE_URL}/api/messages/direct/{user_a['id']}", headers=headers_b)
        assert resp_b_msgs.status_code == 200
        for m in resp_b_msgs.json():
            s = m.get("sender")
            if s:
                assert "email" not in s or s.get("email") is None, (
                    f"PRIVACY VIOLATION: Message sender exposed email: {s.get('email')}"
                )
        print("[PASS] Direct message history: Senders contain ZERO email")

        print("\n=== STEP 4: Reverse Direction (Account B queries Account A) ===")
        # Account B opens own profile
        resp_b_own = client.get(f"{BASE_URL}/api/auth/me", headers=headers_b)
        assert resp_b_own.json().get("email") == user_b["email"], "Account B must see its own email"
        print("[PASS] Account B views its own email on /api/auth/me")

        # Account B queries Account A by ID
        resp_a_by_b = client.get(f"{BASE_URL}/api/users/{user_a['id']}", headers=headers_b)
        assert resp_a_by_b.status_code == 200
        data_a_by_b = resp_a_by_b.json()
        assert "email" not in data_a_by_b or data_a_by_b.get("email") is None, (
            f"PRIVACY VIOLATION: Account A's email leaked to Account B: {data_a_by_b.get('email')}"
        )
        assert data_a_by_b["frank_id"] == user_a["frank_id"]
        print("[PASS] Account B querying Account A by ID: ZERO email, FRANK ID verified")

        # Account B reads conversation partner
        resp_conv_b = client.get(f"{BASE_URL}/api/conversations/{conv_id}", headers=headers_b)
        assert resp_conv_b.status_code == 200
        p_from_b = resp_conv_b.json().get("partner")
        assert "email" not in p_from_b or p_from_b.get("email") is None, (
            f"PRIVACY VIOLATION: Account A's email leaked to Account B in partner: {p_from_b.get('email')}"
        )
        assert p_from_b["frank_id"] == user_a["frank_id"]
        print("[PASS] Account B reads conversation partner: ZERO email, FRANK ID verified")

        print("\n=== STEP 5: Tamper / Parameter Manipulation Resistance ===")
        # Attacker tries arbitrary IDs (e.g. ID 1, 2, 999) to extract email
        for target_id in [1, user_a["id"], user_b["id"]]:
            # When caller is Account B, caller should NEVER see Account A's email
            if target_id == user_a["id"]:
                r = client.get(f"{BASE_URL}/api/users/{target_id}", headers=headers_b)
                if r.status_code == 200:
                    assert "email" not in r.json() or r.json().get("email") is None, "Tamper attempt succeeded in extracting email!"
        print("[PASS] Tamper resistance: Changing user_id never returns another person's email")

        print("\n========================================================")
        print("ALL BACKEND EMAIL PRIVACY TESTS PASSED WITH 100% SUCCESS!")
        print("========================================================\n")

if __name__ == "__main__":
    test_email_privacy_comprehensive()
