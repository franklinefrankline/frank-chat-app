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

def run_tests():
    print("==================================================")
    print("RUNNING PHOTO, DOCUMENT & VOICE ATTACHMENT TEST SUITE")
    print("==================================================")

    db = database.SessionLocal()
    try:
        # 1. Authenticate User A (alex) and User B (sarah)
        user_a = db.query(models.User).filter(models.User.username == "alex").first()
        user_b = db.query(models.User).filter(models.User.username == "sarah").first()
        user_c = db.query(models.User).filter(models.User.username == "david").first()

        assert user_a is not None, "User A (alex) not found"
        assert user_b is not None, "User B (sarah) not found"
        assert user_c is not None, "User C (david) not found"

        token_a = security.create_access_token(data={"sub": user_a.username, "user_id": user_a.id})
        token_b = security.create_access_token(data={"sub": user_b.username, "user_id": user_b.id})
        token_c = security.create_access_token(data={"sub": user_c.username, "user_id": user_c.id})

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}
        headers_c = {"Authorization": f"Bearer {token_c}"}

        print("[PASS] 1. Authentication tokens generated for User A, User B, and User C")

        # 2. Test Photo Upload (User A -> User B)
        photo_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        files_payload = {
            "file": ("test-photo.png", io.BytesIO(photo_bytes), "image/png")
        }
        data_payload = {
            "partner_id": str(user_b.id)
        }
        res = client.post("/api/files/upload", headers=headers_a, files=files_payload, data=data_payload)
        assert res.status_code == 201, f"Photo upload failed: {res.text}"
        photo_doc = res.json()
        assert photo_doc["file_type"] == "image"
        assert photo_doc["original_filename"] == "test-photo.png"
        photo_id = photo_doc["id"]
        print(f"[PASS] 2. Photo uploaded successfully: ID={photo_id}, Type={photo_doc['file_type']}")

        # 3. Test Document Upload (PDF & DOCX)
        pdf_bytes = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f \ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n49\n%%EOF"
        files_payload = {
            "file": ("financial-report.pdf", io.BytesIO(pdf_bytes), "application/pdf")
        }
        data_payload = {
            "partner_id": str(user_b.id)
        }
        res = client.post("/api/files/upload", headers=headers_a, files=files_payload, data=data_payload)
        assert res.status_code == 201, f"PDF upload failed: {res.text}"
        pdf_doc = res.json()
        assert pdf_doc["file_type"] == "pdf"
        pdf_id = pdf_doc["id"]
        print(f"[PASS] 3. PDF document uploaded successfully: ID={pdf_id}, Type={pdf_doc['file_type']}")

        # Test DOCX (unsupported browser preview, but sendable)
        docx_bytes = b"PK\x03\x04test docx content"
        files_payload = {
            "file": ("contract.docx", io.BytesIO(docx_bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        }
        res = client.post("/api/files/upload", headers=headers_a, files=files_payload, data=data_payload)
        assert res.status_code == 201, f"DOCX upload failed: {res.text}"
        docx_doc = res.json()
        assert docx_doc["file_type"] == "word"
        docx_id = docx_doc["id"]
        print(f"[PASS] 4. DOCX document uploaded successfully: ID={docx_id}, Type={docx_doc['file_type']}")

        # 4. Test Voice Message Upload (WebM audio & M4A audio with duration)
        voice_bytes = b"\x1aE\xdf\xa3\x9fB\x86\x81\x01B\xf7\x81\x01\x42\xf2\x81\x04"
        files_payload = {
            "file": (f"voice-message-{int(datetime.now().timestamp())}.webm", io.BytesIO(voice_bytes), "audio/webm;codecs=opus")
        }
        data_payload = {
            "partner_id": str(user_b.id),
            "duration": "7.4"
        }
        res = client.post("/api/files/upload", headers=headers_a, files=files_payload, data=data_payload)
        assert res.status_code == 201, f"Voice upload failed: {res.text}"
        voice_doc = res.json()
        assert voice_doc["file_type"] == "audio"
        assert voice_doc["duration"] == 7.4
        voice_id = voice_doc["id"]
        print(f"[PASS] 5. Voice message uploaded successfully: ID={voice_id}, Type={voice_doc['file_type']}, Duration={voice_doc['duration']}s")

        # 5. Test Creating Message with Attachment Link (PostgreSQL/SQLite Persistence)
        msg_payload = {
            "recipient_id": user_b.id,
            "content": "Check out this photo",
            "message_type": "image",
            "file_id": photo_id
        }
        res = client.post("/api/messages", headers=headers_a, json=msg_payload)
        assert res.status_code == 201, f"Create message with file failed: {res.text}"
        created_msg = res.json()
        assert created_msg["file_id"] == photo_id
        assert created_msg["message_type"] == "image"
        assert created_msg["id"] is not None
        msg_id = created_msg["id"]
        print(f"[PASS] 6. Message record created with file_id: ID={msg_id}")

        # Verify DB linkage
        db_doc = db.query(models.Document).filter(models.Document.id == photo_id).first()
        assert db_doc.message_id == msg_id, "Document not linked to Message in database"
        print(f"[PASS] 7. Database persistence verified: Document {photo_id} linked to Message {msg_id}")

        # 6. Test Private Attachment Authorization (Security / IDOR Protection)
        # User A (uploader) can view:
        res_a = client.get(f"/api/files/{photo_id}/view", headers=headers_a)
        assert res_a.status_code == 200, f"User A should be able to view photo: {res_a.status_code}"

        # User B (recipient) can view:
        res_b = client.get(f"/api/files/{photo_id}/view", headers=headers_b)
        assert res_b.status_code == 200, f"User B should be able to view photo: {res_b.status_code}"

        # User C (unauthorized third-party) must receive 403:
        res_c = client.get(f"/api/files/{photo_id}/view", headers=headers_c)
        assert res_c.status_code == 403, f"Unauthorized User C must receive 403 Forbidden, got {res_c.status_code}"
        print("[PASS] 8. Security verification: Unauthorized User C received 403 Forbidden on private attachment")

        # 7. Test Voice Message Retrieval
        res_voice = client.get(f"/api/files/{voice_id}/view", headers=headers_b)
        assert res_voice.status_code == 200, f"User B should be able to play voice message: {res_voice.status_code}"
        print("[PASS] 9. Receiver voice message retrieval verified with 200 OK")

        # 8. Test Document Download Endpoint
        res_dl = client.get(f"/api/files/{pdf_id}/download", headers=headers_b)
        assert res_dl.status_code == 200, f"User B download failed: {res_dl.status_code}"
        assert "attachment" in res_dl.headers.get("content-disposition", "").lower()
        print("[PASS] 10. Document download endpoint verified with Content-Disposition: attachment")

        print("==================================================")
        print("ALL 10 PHOTO, DOCUMENT & VOICE TESTS PASSED!")
        print("==================================================")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
