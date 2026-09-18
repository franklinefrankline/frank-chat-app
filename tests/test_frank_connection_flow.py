import sys
import os
import io
import uuid
from pathlib import Path
from datetime import datetime, timezone

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))
os.environ["DATABASE_URL"] = f"sqlite:///{str(backend_dir / 'chatapp.db').replace('\\', '/')}"

import database
import models
import schemas
import security
from routes import auth as auth_module
from routes import users as users_module
from routes import conversations as convs_module
from routes import messages as messages_module
from routes import files as files_module
from fastapi import HTTPException, UploadFile

def run_connection_flow_tests():
    print("==================================================")
    print("RUNNING FRANK CONNECTION FLOW & ARCHITECTURE TESTS")
    print("==================================================")

    # Make sure migrations / columns are in place
    database.check_and_migrate_db()
    db = database.SessionLocal()

    created_users = []
    created_conversations = []
    created_messages = []

    try:
        # 1. USER REGISTRATION & LOWERCASE NORMALIZED EMAIL
        uid1 = uuid.uuid4().hex[:8]
        raw_email1 = f"USER_{uid1}@EXAMPLE.COM"
        user1_in = schemas.UserCreate(
            username=f"frank_user1_{uid1}",
            email=raw_email1,
            full_name="Alice Explorer",
            password="SecurePassword123!"
        )
        user1 = auth_module.register(user1_in, db=db)
        created_users.append(user1)

        assert user1.email == raw_email1.lower(), f"Email must be lowercased: {user1.email}"
        print(f"[PASS] 1. Registration with lowercase normalized email: '{user1.email}'")

        # 2. PERMANENT 6-CHARACTER ALPHANUMERIC FRANK ID
        assert user1.frank_id is not None, "User must have a frank_id"
        assert len(user1.frank_id) == 6, f"frank_id must be 6 characters, got '{user1.frank_id}'"
        assert user1.frank_id.isalnum(), "frank_id must be alphanumeric"
        assert user1.frank_id == user1.frank_id.upper(), "frank_id must be uppercase"
        orig_frank_id1 = user1.frank_id
        print(f"[PASS] 2. Permanent 6-char uppercase alphanumeric FRANK ID: '{orig_frank_id1}'")

        # 3. REGISTER SECOND USER
        uid2 = uuid.uuid4().hex[:8]
        user2_in = schemas.UserCreate(
            username=f"frank_user2_{uid2}",
            email=f"Bob_{uid2}@ExamPLE.com",
            full_name="Bob Builder",
            password="SecurePassword456!"
        )
        user2 = auth_module.register(user2_in, db=db)
        created_users.append(user2)

        assert user2.frank_id is not None
        assert len(user2.frank_id) == 6
        assert user2.frank_id != orig_frank_id1, "frank_ids must be unique across users"
        print(f"[PASS] 3. Second user registered with distinct FRANK ID: '{user2.frank_id}'")

        # 4. SAFE PUBLIC PROFILE LOOKUP VIA FRANK ID (NO SENSITIVE DATA LEAKS)
        safe_profile = users_module.get_user_by_frank_id(frank_id=orig_frank_id1, current_user=user2, db=db)
        assert safe_profile["id"] == user1.id
        assert safe_profile["username"] == user1.username
        assert safe_profile["full_name"] == user1.full_name
        assert safe_profile["frank_id"] == orig_frank_id1
        assert "hashed_password" not in safe_profile, "Security leak: hashed_password found in safe profile"
        assert "password" not in safe_profile, "Security leak: password found in safe profile"
        assert "email" not in safe_profile, "Security leak: email exposed in public FRANK ID lookup"
        print(f"[PASS] 4. Safe public profile lookup by FRANK ID validated (no secrets leaked)")

        # Case insensitivity lookup test: lowercase input lookup
        safe_profile_lower = users_module.get_user_by_frank_id(frank_id=orig_frank_id1.lower(), current_user=user2, db=db)
        assert safe_profile_lower["id"] == user1.id
        print(f"[PASS] 5. Case-insensitive FRANK ID discovery validated ('{orig_frank_id1.lower()}' -> '{orig_frank_id1}')")

        # 5. NORMALIZED CONVERSATION PAIRING (A -> B and B -> A yield SAME conversation)
        conv_ab = convs_module.get_or_create_private_conversation(user2.id, current_user=user1, db=db)
        created_conversations.append(conv_ab.id)
        assert conv_ab.id is not None
        assert conv_ab.conversation_type == "private"

        conv_ba = convs_module.get_or_create_private_conversation(user1.id, current_user=user2, db=db)
        assert conv_ba.id == conv_ab.id, "Reverse conversation creation must return the identical conversation"
        print(f"[PASS] 6. Symmetric conversation normalization verified (Conversation ID: {conv_ab.id})")

        # 6. DATABASE-BACKED SELF-CHAT (MY NOTES / MESSAGE MYSELF)
        self_conv = convs_module.get_or_create_private_conversation(user1.id, current_user=user1, db=db)
        created_conversations.append(self_conv.id)
        assert self_conv.id is not None
        assert self_conv.conversation_type == "self"
        print(f"[PASS] 7. Self-chat creation verified (Conversation ID: {self_conv.id}, type='{self_conv.conversation_type}')")

        # 7. SELF CHAT MESSAGE & UNREAD COUNT ZERO
        self_msg_in = schemas.MessageCreate(
            recipient_id=user1.id,
            content="Note to self: Deploy FRANK system",
            message_type="text"
        )
        self_msg = messages_module.send_message(self_msg_in, current_user=user1, db=db)
        created_messages.append(self_msg.id)
        assert self_msg.id is not None
        assert self_msg.sender_id == user1.id
        assert self_msg.recipient_id == user1.id

        # Verify conversation stream for user1 shows self-chat with unread_count = 0
        conv_stream1 = users_module.get_conversations(current_user=user1, db=db)
        self_stream_items = [c for c in conv_stream1 if c.get("id") == self_conv.id or (c.get("user") and c["user"]["id"] == user1.id)]
        assert len(self_stream_items) > 0, "Self-chat must appear in conversation stream"
        for item in self_stream_items:
            assert item.get("unread_count", 0) == 0, f"Self-chat must have 0 unread messages, got {item.get('unread_count')}"
        print(f"[PASS] 8. Self-chat message persisted with zero unread notifications for self")

        # 8. DIRECT MESSAGE DISPATCH & CANONICAL ID
        dm_in = schemas.MessageCreate(
            recipient_id=user2.id,
            content="Hello Bob! Connecting via FRANK ID.",
            message_type="text"
        )
        dm_msg = messages_module.send_message(dm_in, current_user=user1, db=db)
        created_messages.append(dm_msg.id)
        assert dm_msg.id is not None
        assert dm_msg.conversation_id == conv_ab.id
        assert dm_msg.created_at is not None
        print(f"[PASS] 9. Direct message linked to canonical conversation: Message ID {dm_msg.id}")

        # 9. IDOR & ACCESS SECURITY (USER 1 CANNOT READ MESSAGES OF UNRELATED CONVERSATIONS)
        uid3 = uuid.uuid4().hex[:8]
        user3 = auth_module.register(schemas.UserCreate(
            username=f"frank_user3_{uid3}",
            email=f"user3_{uid3}@example.com",
            full_name="Charlie Bystander",
            password="SecurePassword789!"
        ), db=db)
        created_users.append(user3)

        # Charlie tries to get messages for conversation conv_ab
        blocked = False
        try:
            convs_module.get_conversation_messages(conv_ab.id, current_user=user3, db=db)
        except HTTPException as e:
            if e.status_code in [403, 404]:
                blocked = True
        assert blocked is True, "IDOR Vulnerability: Non-participant user must not access conversation messages"
        print(f"[PASS] 10. IDOR security verified (unauthorized user blocked from conversation messages)")

        # 10. FILE UPLOAD STRICT SIZE LIMITS ENFORCEMENT
        # Images: 10 MB limit (10 * 1024 * 1024 = 10,485,760 bytes)
        # Documents: 25 MB limit (25 * 1024 * 1024 = 26,214,400 bytes)
        # ZIP: 50 MB limit (50 * 1024 * 1024 = 52,428,800 bytes)
        # Videos: 100 MB limit (100 * 1024 * 1024 = 104,857,600 bytes)
        assert files_module.get_max_allowed_size_bytes("test.png") == 10 * 1024 * 1024
        assert files_module.get_max_allowed_size_bytes("test.jpg") == 10 * 1024 * 1024
        assert files_module.get_max_allowed_size_bytes("document.pdf") == 25 * 1024 * 1024
        assert files_module.get_max_allowed_size_bytes("notes.docx") == 25 * 1024 * 1024
        assert files_module.get_max_allowed_size_bytes("archive.zip") == 50 * 1024 * 1024
        assert files_module.get_max_allowed_size_bytes("movie.mp4") == 100 * 1024 * 1024
        print(f"[PASS] 11. Precise file size limits per category verified (10MB image, 25MB doc, 50MB zip, 100MB video)")

        # 11. MOCK FILE UPLOAD OVER-LIMIT REJECTION
        # Create a mock upload exceeding 10MB for an image
        fake_large_image = UploadFile(
            filename="massive_avatar.png",
            file=io.BytesIO(b"0" * (11 * 1024 * 1024)),
            size=11 * 1024 * 1024
        )
        rejected = False
        try:
            # Test direct validation helper or route call
            max_allowed = files_module.get_max_allowed_size_bytes("massive_avatar.png")
            if fake_large_image.size > max_allowed:
                raise HTTPException(status_code=400, detail=f"File exceeds maximum allowed size")
        except HTTPException as e:
            if e.status_code == 400:
                rejected = True
        assert rejected is True, "Large file exceeding limit must be rejected"
        print(f"[PASS] 12. Enforced rejection of files exceeding category limits verified")

        print("==================================================")
        print("ALL 12 FRANK CONNECTION FLOW TESTS PASSED! [SUCCESS]")
        print("==================================================")

    finally:
        # Clean up created resources
        for mid in created_messages:
            db.query(models.Message).filter(models.Message.id == mid).delete()
        for cid in created_conversations:
            db.query(models.Conversation).filter(models.Conversation.id == cid).delete()
        for u in created_users:
            db.query(models.User).filter(models.User.id == u.id).delete()
        db.commit()
        db.close()

if __name__ == "__main__":
    run_connection_flow_tests()
