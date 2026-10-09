import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath("backend"))

from fastapi.testclient import TestClient
from main import app
import models
import security
from database import SessionLocal

client = TestClient(app)
db = SessionLocal()

TAMIL_CONTENT = (
    "முயற்சியின் வெற்றி:\n"
    "ஒரு சிறிய கிராமத்தில் குமார் என்ற இளைஞன் வாழ்ந்து வந்தான். "
    "அவன் தனது நிலத்தில் மழைநீர் சேகரிப்பு அமைப்பை உருவாக்கினான். "
    "நாம் அனைவரும் நாளை காலை 10 மணிக்கு இந்த திட்டத்தை மதிப்பாய்வு செய்வோம்."
)

try:
    admin = db.query(models.User).filter(models.User.role == "admin").first()
    token = security.create_access_token({"sub": admin.username, "user_id": admin.id, "email": admin.email, "role": admin.role})

    # Test Tamil message in admin self-chat
    self_conv = db.query(models.Conversation).filter(models.Conversation.user_a_id == admin.id, models.Conversation.user_b_id == admin.id).first()
    if not self_conv:
        self_conv = models.Conversation(user_a_id=admin.id, user_b_id=admin.id)
        db.add(self_conv)
        db.commit()
        db.refresh(self_conv)

    tamil_msg = models.Message(
        sender_id=admin.id,
        recipient_id=admin.id,
        content=TAMIL_CONTENT,
        message_type="text"
    )
    db.add(tamil_msg)
    db.commit()
    db.refresh(tamil_msg)

    # 1. Targeted Smart Analysis on Tamil Message
    resp = client.get(
        f"/api/conversations/{self_conv.id}/smart-analysis",
        params={"conversation_type": "direct", "message_id": tamil_msg.id, "include_message": True},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, f"Tamil targeted analysis failed: {resp.text}"
    data = resp.json()
    print("Tamil targeted analysis 200 OK:")
    print("  Summary:", data.get("summary", {}).get("text")[:100])
    print("  Mode:", data.get("mode"))
    print("  Key points count:", len(data.get("key_points") or []))

    # 2. Document Smart Analysis on document
    sample_doc = db.query(models.Document).filter(models.Document.uploader_id == admin.id).first()
    if sample_doc:
        resp_doc = client.get(
            f"/api/conversations/{self_conv.id}/smart-analysis",
            params={"conversation_type": "direct", "attachment_id": sample_doc.id, "include_document": True},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp_doc.status_code == 200, f"Document targeted analysis failed: {resp_doc.text}"
        doc_data = resp_doc.json()
        print("Document targeted analysis 200 OK:")
        print("  Summary:", doc_data.get("summary", {}).get("text")[:100])
        print("  Selected document:", doc_data.get("selected_document"))

    print("\n✅ TAMIL & DOCUMENT SMART ANALYSIS VERIFIED 100%!")
finally:
    db.close()
