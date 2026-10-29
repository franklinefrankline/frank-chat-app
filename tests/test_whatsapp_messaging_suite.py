import uuid
import httpx
from datetime import timedelta
import sys
from pathlib import Path

# Add backend to path to import models and security
backend_path = Path(r"C:\Users\inbat\Downloads\frank-chat-app-main\frank-chat-app-main\backend")
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from database import SessionLocal
import models
from security import hash_password, create_access_token

BASE_URL = "http://127.0.0.1:8000"


def create_test_user(prefix: str):
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
            is_online=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(
            data={"sub": user.username, "user_id": user.id, "email": user.email, "role": user.role},
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


def test_whatsapp_messaging_comprehensive():
    print("\n--- Starting WhatsApp-Style Messaging Comprehensive Test Suite ---")

    with httpx.Client(timeout=15.0) as client:
        # 1. Provision 3 test users
        user_a = create_test_user("alice")
        user_b = create_test_user("bob")
        user_c = create_test_user("charlie")

        headers_a = {"Authorization": f"Bearer {user_a['token']}"}
        headers_b = {"Authorization": f"Bearer {user_b['token']}"}
        headers_c = {"Authorization": f"Bearer {user_c['token']}"}

        # 2. Alice sends a direct message to Bob
        print("1. Alice sends direct message to Bob...")
        send_res = client.post(f"{BASE_URL}/api/messages", headers=headers_a, json={
            "recipient_id": user_b["id"],
            "content": "Hello Bob! This is message #1 from Alice.",
            "message_type": "text"
        })
        assert send_res.status_code == 201, f"Send message failed: {send_res.text}"
        msg1 = send_res.json()
        assert msg1["content"] == "Hello Bob! This is message #1 from Alice."
        assert msg1["sender_id"] == user_a["id"]
        assert msg1["recipient_id"] == user_b["id"]
        msg1_id = msg1["id"]
        print(f"   [PASS] Message sent successfully (ID: {msg1_id}, status: {msg1['status']})")

        # 3. Bob reads direct messages -> status should become 'read' and read_at set
        print("2. Bob reads direct messages from Alice...")
        bob_msgs_res = client.get(f"{BASE_URL}/api/messages/direct/{user_a['id']}", headers=headers_b)
        assert bob_msgs_res.status_code == 200, f"Bob get messages failed: {bob_msgs_res.text}"
        bob_msgs = bob_msgs_res.json()
        matching_msg = next((m for m in bob_msgs if m["id"] == msg1_id), None)
        assert matching_msg is not None, "Message not found in Bob's view"
        assert matching_msg["status"] == "read", f"Expected status 'read', got {matching_msg['status']}"
        assert matching_msg["read_at"] is not None, "Expected read_at timestamp to be set"
        print(f"   [PASS] Read receipt verified: status='{matching_msg['status']}', read_at='{matching_msg['read_at']}'")

        # 4. Alice pins message #1
        print("3. Alice pins message #1...")
        pin_res = client.post(f"{BASE_URL}/api/messages/{msg1_id}/pin", headers=headers_a)
        assert pin_res.status_code == 200, f"Pin failed: {pin_res.text}"
        assert pin_res.json()["is_pinned"] is True
        print("   [PASS] Message successfully pinned")

        # Verify Bob sees pinned message
        bob_view = client.get(f"{BASE_URL}/api/messages/direct/{user_a['id']}", headers=headers_b).json()
        b_msg1 = next(m for m in bob_view if m["id"] == msg1_id)
        assert b_msg1["is_pinned"] is True, "Expected is_pinned=True in Bob's view"
        print("   [PASS] Bob sees is_pinned=True")

        # 5. Bob stars message #1
        print("4. Bob stars message #1...")
        star_res = client.post(f"{BASE_URL}/api/messages/{msg1_id}/star", headers=headers_b)
        assert star_res.status_code == 200, f"Star failed: {star_res.text}"
        assert star_res.json()["is_starred"] is True
        print("   [PASS] Bob starred message")

        # Verify Bob's starred messages endpoint
        bob_stars_res = client.get(f"{BASE_URL}/api/messages/starred", headers=headers_b)
        assert bob_stars_res.status_code == 200
        bob_stars = bob_stars_res.json()
        assert any(m["id"] == msg1_id for m in bob_stars), "Expected msg1 in Bob's starred messages"
        print("   [PASS] Message found in Bob's GET /api/messages/starred")

        # Alice should NOT have it starred
        alice_stars = client.get(f"{BASE_URL}/api/messages/starred", headers=headers_a).json()
        assert not any(m["id"] == msg1_id for m in alice_stars), "Alice should not have Bob's starred message"
        print("   [PASS] Per-user starring isolation confirmed: Alice does not see it in her stars")

        # 6. Alice edits message #1
        print("5. Alice edits message #1...")
        edit_res = client.put(f"{BASE_URL}/api/messages/{msg1_id}", headers=headers_a, json={
            "content": "Hello Bob! This message was edited by Alice."
        })
        assert edit_res.status_code == 200, f"Edit failed: {edit_res.text}"
        assert edit_res.json()["content"] == "Hello Bob! This message was edited by Alice."
        assert edit_res.json()["updated_at"] is not None
        print("   [PASS] Message edited and updated_at timestamp updated")

        # 7. Alice forwards message #1 to Charlie
        print("6. Alice forwards message #1 to Charlie...")
        fwd_res = client.post(f"{BASE_URL}/api/messages/{msg1_id}/forward", headers=headers_a, json={
            "recipient_ids": [user_c["id"]],
            "group_ids": []
        })
        assert fwd_res.status_code == 200, f"Forward failed: {fwd_res.text}"
        fwd_msgs = fwd_res.json()
        assert len(fwd_msgs) == 1
        assert fwd_msgs[0]["is_forwarded"] is True
        assert fwd_msgs[0]["recipient_id"] == user_c["id"]
        print(f"   [PASS] Forwarded message created for Charlie (is_forwarded: {fwd_msgs[0]['is_forwarded']})")

        # Verify Charlie sees forwarded message
        charlie_msgs = client.get(f"{BASE_URL}/api/messages/direct/{user_a['id']}", headers=headers_c).json()
        c_fwd = next((m for m in charlie_msgs if m["id"] == fwd_msgs[0]["id"]), None)
        assert c_fwd is not None
        assert c_fwd["is_forwarded"] is True
        print("   [PASS] Charlie sees message with is_forwarded=True")

        # 8. Alice sends message #2 to Bob for Delete tests
        print("7. Testing Delete for Me vs Delete for Everyone...")
        msg2 = client.post(f"{BASE_URL}/api/messages", headers=headers_a, json={
            "recipient_id": user_b["id"],
            "content": "Secret message #2 that Bob will delete for me.",
            "message_type": "text"
        }).json()
        msg2_id = msg2["id"]

        # Bob deletes message #2 FOR ME
        del_me_res = client.delete(f"{BASE_URL}/api/messages/{msg2_id}?delete_type=me", headers=headers_b)
        assert del_me_res.status_code == 200
        assert del_me_res.json()["delete_type"] == "me"

        # Bob's view: msg2 should NOT be in Bob's direct messages
        bob_view2 = client.get(f"{BASE_URL}/api/messages/direct/{user_a['id']}", headers=headers_b).json()
        assert not any(m["id"] == msg2_id for m in bob_view2), "Message #2 should be hidden from Bob after delete for me"
        print("   [PASS] Delete for Me: Message #2 is hidden from Bob's view")

        # Alice's view: msg2 MUST REMAIN completely intact and visible to Alice!
        alice_view2 = client.get(f"{BASE_URL}/api/messages/direct/{user_b['id']}", headers=headers_a).json()
        a_msg2 = next((m for m in alice_view2 if m["id"] == msg2_id), None)
        assert a_msg2 is not None, "Alice must still see Message #2 after Bob deleted for me"
        assert a_msg2["content"] == "Secret message #2 that Bob will delete for me."
        print("   [PASS] Zero data loss: Alice still has Message #2 intact")

        # 9. Alice sends message #3 and deletes FOR EVERYONE
        msg3 = client.post(f"{BASE_URL}/api/messages", headers=headers_a, json={
            "recipient_id": user_b["id"],
            "content": "Message #3 to delete for everyone.",
            "message_type": "text"
        }).json()
        msg3_id = msg3["id"]

        del_all_res = client.delete(f"{BASE_URL}/api/messages/{msg3_id}?delete_type=everyone", headers=headers_a)
        assert del_all_res.status_code == 200
        assert del_all_res.json()["delete_type"] == "everyone"

        # Both Alice and Bob should see the WhatsApp placeholder "[DELETED] This message was deleted"
        alice_view3 = client.get(f"{BASE_URL}/api/messages/direct/{user_b['id']}", headers=headers_a).json()
        bob_view3 = client.get(f"{BASE_URL}/api/messages/direct/{user_a['id']}", headers=headers_b).json()

        a_msg3 = next(m for m in alice_view3 if m["id"] == msg3_id)
        b_msg3 = next(m for m in bob_view3 if m["id"] == msg3_id)

        assert "This message was deleted" in a_msg3["content"], f"Expected placeholder in Alice's view, got {a_msg3['content']}"
        assert "This message was deleted" in b_msg3["content"], f"Expected placeholder in Bob's view, got {b_msg3['content']}"
        assert a_msg3["deleted_for_everyone"] is True
        assert b_msg3["deleted_for_everyone"] is True
        print("   [PASS] Delete for Everyone: Placeholder '[DELETED] This message was deleted' returned to both participants")

        # 10. Clear conversation test
        print("8. Testing conversation clearing without data destruction...")
        clear_res = client.delete(f"{BASE_URL}/api/users/conversations/direct/{user_b['id']}", headers=headers_a)
        assert clear_res.status_code == 200

        # Alice's view: direct messages should now be empty (soft-deleted for Alice)
        alice_cleared = client.get(f"{BASE_URL}/api/messages/direct/{user_b['id']}", headers=headers_a).json()
        assert len(alice_cleared) == 0, f"Expected 0 messages for Alice after clear, got {len(alice_cleared)}"

        # Bob's view: Bob STILL has his conversation and messages!
        bob_retained = client.get(f"{BASE_URL}/api/messages/direct/{user_a['id']}", headers=headers_b).json()
        assert len(bob_retained) > 0, "Bob's messages must be preserved when Alice clears her conversation"
        print(f"   [PASS] Conversation clear isolation verified: Alice cleared her view (0 msgs), Bob retained his ({len(bob_retained)} msgs)")

        print("\n=== ALL WHATSAPP-STYLE MESSAGING BACKEND & INTEGRATION TESTS PASSED 100% ===")


if __name__ == "__main__":
    test_whatsapp_messaging_comprehensive()
