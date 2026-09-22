import sys
import os
import io
from pathlib import Path
from datetime import datetime, timezone

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))
os.environ["DATABASE_URL"] = f"sqlite:///{str(backend_dir / 'chatapp.db').replace('\\', '/')}"

from fastapi.testclient import TestClient
from main import app
import database
import models
import schemas
import security

client = TestClient(app)

def run_comprehensive_suite():
    print("==================================================")
    print("RUNNING COMPLETE FRANK BACKEND & API SUITE")
    print("==================================================")

    db = database.SessionLocal()
    try:
        # 1. Authenticate users
        alex = db.query(models.User).filter(models.User.username == "alex").first()
        sarah = db.query(models.User).filter(models.User.username == "sarah").first()
        david = db.query(models.User).filter(models.User.username == "david").first()

        assert alex is not None and sarah is not None and david is not None

        token_alex = security.create_access_token(data={"sub": alex.username, "user_id": alex.id})
        token_sarah = security.create_access_token(data={"sub": sarah.username, "user_id": sarah.id})
        token_david = security.create_access_token(data={"sub": david.username, "user_id": david.id})

        headers_alex = {"Authorization": f"Bearer {token_alex}"}
        headers_sarah = {"Authorization": f"Bearer {token_sarah}"}
        headers_david = {"Authorization": f"Bearer {token_david}"}
        print("[PASS] 1. Authentication tokens generated")

        # 2. Test Self-Messaging (Notes to Self)
        res = client.post("/api/users/conversations/private", headers=headers_alex, json={"target_user_id": alex.id})
        assert res.status_code == 200, f"Self conversation creation failed: {res.text}"
        self_conv = res.json()
        assert self_conv["user_a_id"] == alex.id and self_conv["user_b_id"] == alex.id
        print(f"[PASS] 2. Self conversation created successfully (ID: {self_conv['id']})")

        # Send self message
        res = client.post("/api/messages", headers=headers_alex, json={
            "recipient_id": alex.id,
            "content": "Personal note: Remember to review quarterly targets!",
            "message_type": "text"
        })
        assert res.status_code == 201
        self_msg = res.json()
        assert self_msg["sender_id"] == alex.id and self_msg["recipient_id"] == alex.id
        print(f"[PASS] 3. Self message sent and persisted (Message ID: {self_msg['id']})")

        # Verify conversations endpoint formats self-chat as "(You)" with notes bio
        res = client.get("/api/users/conversations", headers=headers_alex)
        assert res.status_code == 200
        convs = res.json()
        self_in_convs = [c for c in convs if c["type"] == "direct" and c["id"] == alex.id]
        assert len(self_in_convs) == 1
        assert "(You)" in self_in_convs[0]["name"]
        assert "Message yourself" in self_in_convs[0]["bio"]
        print(f"[PASS] 4. Self conversation stream verified with (You) branding")

        # 3. Test Conversation Preferences (Pin, Favorite, Mute)
        res = client.post("/api/users/conversations/preferences", headers=headers_alex, json={
            "conversation_type": "direct",
            "conversation_id": sarah.id,
            "is_favorite": True,
            "is_pinned": True,
            "is_muted": False
        })
        assert res.status_code == 200
        pref = res.json()
        assert pref["is_favorite"] is True and pref["is_pinned"] is True
        print(f"[PASS] 5. Conversation preference updated (Favorite & Pinned)")

        # Verify get preferences endpoint
        res = client.get("/api/users/conversations/preferences", headers=headers_alex)
        assert res.status_code == 200
        prefs_list = res.json()
        sarah_pref = [p for p in prefs_list.get("favorites", []) if f"direct_{sarah.id}" in p]
        assert len(sarah_pref) == 1
        print(f"[PASS] 6. Conversation preferences retrieved successfully")

        # 4. Test Supported Document Types Upload & MIME codec handling
        supported_types = [
            ("report.pdf", b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "application/pdf", "pdf"),
            ("notes.txt", b"Plain text note content", "text/plain", "text"),
            ("sheet.xlsx", b"PK\x03\x04test xlsx content", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "excel"),
            ("slides.pptx", b"PK\x03\x04test pptx content", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentation"),
            ("data.csv", b"id,name,score\n1,Alex,95\n2,Sarah,98", "text/csv", "excel"),
            ("archive.zip", b"PK\x03\x04test zip content", "application/zip", "archive"),
            ("voice.webm", b"\x1aE\xdf\xa3\x9fB\x86\x81\x01B\xf7\x81\x01\x42\xf2\x81\x04", "audio/webm;codecs=opus", "audio"),
        ]

        uploaded_docs = {}
        for filename, content, mime, expected_type in supported_types:
            files_payload = {"file": (filename, io.BytesIO(content), mime)}
            data_payload = {"partner_id": str(sarah.id)}
            res = client.post("/api/files/upload", headers=headers_alex, files=files_payload, data=data_payload)
            assert res.status_code == 201, f"Failed to upload {filename}: {res.text}"
            doc_data = res.json()
            assert doc_data["file_type"] == expected_type, f"Expected {expected_type}, got {doc_data['file_type']}"
            uploaded_docs[filename] = doc_data["id"]

        print(f"[PASS] 7. Uploaded 7 diverse file types successfully (PDF, TXT, XLSX, PPTX, CSV, ZIP, Audio with codec)")

        # Verify codec was stripped from audio mime_type in database
        audio_id = uploaded_docs["voice.webm"]
        audio_doc = db.query(models.Document).filter(models.Document.id == audio_id).first()
        assert audio_doc.mime_type == "audio/webm", f"Expected 'audio/webm', got '{audio_doc.mime_type}'"
        print(f"[PASS] 8. Codec stripped from audio MIME type in DB: {audio_doc.mime_type}")

        # 5. Test Download Authorization & IDOR Protection
        pdf_id = uploaded_docs["report.pdf"]
        # Alex (uploader) -> 200
        assert client.get(f"/api/files/{pdf_id}/download", headers=headers_alex).status_code == 200
        # Sarah (recipient) -> 200
        assert client.get(f"/api/files/{pdf_id}/download", headers=headers_sarah).status_code == 200
        # David (unauthorized) -> 403
        assert client.get(f"/api/files/{pdf_id}/download", headers=headers_david).status_code == 403
        print(f"[PASS] 9. Download IDOR protection verified: Authorized users 200, Unauthorized 403")

        # 6. Test Message Edit & Delete APIs
        # Send a message to Sarah
        res = client.post("/api/messages", headers=headers_alex, json={
            "recipient_id": sarah.id,
            "content": "Original message text",
            "message_type": "text"
        })
        assert res.status_code == 201
        msg = res.json()
        msg_id = msg["id"]

        # Sarah attempts to edit Alex's message -> 403
        res = client.put(f"/api/messages/{msg_id}", headers=headers_sarah, json={"content": "Hacked message"})
        assert res.status_code == 403
        print(f"[PASS] 10. Non-owner blocked from editing message (403 Forbidden)")

        # Alex edits his message -> 200
        res = client.put(f"/api/messages/{msg_id}", headers=headers_alex, json={"content": "Updated message text"})
        assert res.status_code == 200
        assert res.json()["content"] == "Updated message text"
        assert res.json()["updated_at"] is not None
        print(f"[PASS] 11. Owner successfully edited message with updated_at timestamp")

        # Sarah attempts to delete Alex's message -> 403
        res = client.delete(f"/api/messages/{msg_id}", headers=headers_sarah)
        assert res.status_code == 403
        print(f"[PASS] 12. Non-owner blocked from deleting message (403 Forbidden)")

        # Alex deletes his message -> 200
        res = client.delete(f"/api/messages/{msg_id}", headers=headers_alex)
        assert res.status_code == 200
        # Verify message is gone from database
        deleted = db.query(models.Message).filter(models.Message.id == msg_id).first()
        assert deleted is None
        print(f"[PASS] 13. Owner successfully deleted message")

        # 7. Test Direct Conversation Deletion
        res = client.delete(f"/api/users/conversations/direct/{alex.id}", headers=headers_alex)
        assert res.status_code == 200
        print(f"[PASS] 14. Direct conversation deletion API verified")

        print("==================================================")
        print("ALL 14 COMPREHENSIVE SUITE TESTS PASSED! [SUCCESS]")
        print("==================================================")

    finally:
        db.close()

if __name__ == "__main__":
    run_comprehensive_suite()
