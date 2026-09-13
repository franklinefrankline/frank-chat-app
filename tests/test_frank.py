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
from routes import files as files_module
from routes import users as users_module
from routes import groups as groups_module
from routes import messages as messages_module

def run_tests():
    print("==================================================")
    print("RUNNING DEPENDENCY-FREE FRANK TEST SUITE")
    print("==================================================")

    db = database.SessionLocal()
    try:
        # 1. Test Password Hashing and Verification
        pwd = "SecretPassword123!"
        hashed = security.hash_password(pwd)
        assert hashed != pwd
        assert security.verify_password(pwd, hashed) is True
        assert security.verify_password("WrongPassword", hashed) is False
        print("[PASS] 1. Password hashing & HMAC verification")

        # 2. Test JWT Generation & Decoding
        token = security.create_access_token(data={"sub": "alex", "user_id": 1})
        payload = security.decode_token(token)
        assert payload is not None
        assert payload["sub"] == "alex"
        assert payload["user_id"] == 1
        print("[PASS] 2. Cryptographic JWT token generation and verification")

        # 3. Test Database Models & Schema Creation
        test_user = db.query(models.User).filter(models.User.username == "alex").first()
        assert test_user is not None, "Demo user alex not found in DB"
        print(f"[PASS] 3. Database user retrieved: {test_user.full_name} (@{test_user.username})")

        # 4. Test Group Creation & Membership
        test_group = models.Group(
            name="Test Architecture Group",
            description="Testing FRANK group architecture",
            created_by=test_user.id
        )
        db.add(test_group)
        db.commit()
        db.refresh(test_group)
        assert test_group.id is not None

        admin_member = models.GroupMember(
            group_id=test_group.id,
            user_id=test_user.id,
            role="admin"
        )
        db.add(admin_member)
        db.commit()
        print(f"[PASS] 4. Group created with Admin member: '{test_group.name}' (ID: {test_group.id})")

        # 5. Test File Sanitization & Extension Whitelist
        assert files_module.sanitize_filename("../../etc/passwd/report.pdf") == "report.pdf"
        assert files_module.sanitize_filename("valid_report (1).docx") == "valid_report (1).docx"
        assert ".pdf" in files_module.ALLOWED_EXTENSIONS
        assert ".docx" in files_module.ALLOWED_EXTENSIONS
        assert ".xlsx" in files_module.ALLOWED_EXTENSIONS
        assert ".zip" in files_module.ALLOWED_EXTENSIONS
        assert ".exe" in files_module.DISALLOWED_EXTENSIONS
        assert ".bat" in files_module.DISALLOWED_EXTENSIONS
        assert ".sh" in files_module.DISALLOWED_EXTENSIONS
        print("[PASS] 5. Filename sanitization and extension security policies verified")

        # 6. Test Document Model Creation & Storage
        doc = models.Document(
            uploader_id=test_user.id,
            group_id=test_group.id,
            original_filename="FRANK_Architecture.pdf",
            stored_filename=f"{uuid.uuid4().hex}.pdf",
            file_size=1048576,
            mime_type="application/pdf",
            file_type="pdf"
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        assert doc.id is not None
        print(f"[PASS] 6. Document record saved in database (Doc ID: {doc.id}, Size: {doc.file_size} bytes)")

        # 7. Test Message with Document Attachment
        doc_msg = models.Message(
            sender_id=test_user.id,
            group_id=test_group.id,
            content="Shared a file: FRANK_Architecture.pdf",
            message_type="document",
            file_id=doc.id,
            status="sent",
            created_at=datetime.now(timezone.utc)
        )
        db.add(doc_msg)
        db.commit()
        db.refresh(doc_msg)
        assert doc_msg.id is not None
        assert doc_msg.message_type == "document"
        assert doc_msg.file_id == doc.id
        print(f"[PASS] 7. Document message created & linked (Message ID: {doc_msg.id})")

        # 8. Test Document Access Authorization
        # Uploader has access
        assert files_module.verify_document_access(doc, test_user, db) is True

        # Group member has access
        sarah = db.query(models.User).filter(models.User.username == "sarah").first()
        assert sarah is not None
        # Before joining group
        assert files_module.verify_document_access(doc, sarah, db) is False

        # Add Sarah to group
        sarah_member = models.GroupMember(group_id=test_group.id, user_id=sarah.id, role="member")
        db.add(sarah_member)
        db.commit()
        # After joining group
        assert files_module.verify_document_access(doc, sarah, db) is True
        print("[PASS] 8. Document access control (RBAC & membership verification) verified")

        # 9. Test Conversations Stream (Groups + Direct)
        convs = users_module.get_conversations(current_user=test_user, db=db)
        assert len(convs) >= 1
        conv_types = [c["type"] for c in convs]
        assert "group" in conv_types, "Group not present in conversation stream"
        for c in convs:
            if c.get("last_message") and c["last_message"].get("created_at"):
                assert c["last_message"]["created_at"].endswith("Z"), f"Timestamp does not end with Z: {c['last_message']['created_at']}"
            if c.get("last_seen"):
                assert c["last_seen"].endswith("Z"), f"last_seen does not end with Z: {c['last_seen']}"
        print(f"[PASS] 9. Unified conversation stream verified: {len(convs)} conversation(s) returned with ISO UTC timestamps (Z suffix)")

        # 10. Test Accurate Message Creation with Timezone-Aware UTC Timestamp
        new_msg_in = schemas.MessageCreate(
            recipient_id=sarah.id,
            content="Testing accurate timestamps in FRANK",
            message_type="text"
        )
        created_msg = messages_module.send_message(new_msg_in, current_user=test_user, db=db)
        assert created_msg.id is not None
        assert created_msg.created_at is not None
        formatted_created_at = schemas.format_iso_utc(created_msg.created_at)
        assert formatted_created_at.endswith("Z"), f"Formatted created_at must end with Z: {formatted_created_at}"
        assert created_msg.updated_at is None, "New message updated_at must be None"
        original_created_at = created_msg.created_at
        print(f"[PASS] 10. Accurate backend message creation: ID {created_msg.id}, UTC timestamp: {formatted_created_at}")

        # 11. Test Message Edit (created_at preserved, updated_at set)
        edit_in = schemas.MessageUpdate(content="Testing accurate timestamps in FRANK (Edited)")
        edited_msg = messages_module.edit_message(created_msg.id, edit_in, current_user=test_user, db=db)
        assert edited_msg.content == "Testing accurate timestamps in FRANK (Edited)"
        # Verify created_at is strictly preserved
        assert edited_msg.created_at == original_created_at, "created_at must NOT change when message is edited!"
        assert edited_msg.updated_at is not None, "updated_at must be populated after edit"
        formatted_updated_at = schemas.format_iso_utc(edited_msg.updated_at)
        assert formatted_updated_at.endswith("Z"), f"Formatted updated_at must end with Z: {formatted_updated_at}"
        print(f"[PASS] 11. Message edit verified: created_at preserved, updated_at set to {formatted_updated_at}")

        # 12. Test Unauthorized Message Edit Prevention
        unauthorized = False
        try:
            messages_module.edit_message(created_msg.id, edit_in, current_user=sarah, db=db)
        except Exception as e:
            unauthorized = True
        assert unauthorized is True, "Other users must not be allowed to edit a message"
        print("[PASS] 12. Message edit authorization security verified (non-owner blocked)")

        # Clean up test group and records
        db.delete(created_msg)
        db.delete(doc_msg)
        db.delete(doc)
        db.delete(sarah_member)
        db.delete(admin_member)
        db.delete(test_group)
        db.commit()
        print("[PASS] 13. Test cleanup completed successfully")

        print("==================================================")
        print("ALL 13 VERIFICATION TESTS PASSED SUCCESSFULLY! [SUCCESS]")
        print("==================================================")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
