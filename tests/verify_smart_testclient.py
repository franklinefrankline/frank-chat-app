import sys
import os

sys.path.insert(0, os.path.abspath("backend"))

from fastapi.testclient import TestClient
from main import app
import models
import security
from database import SessionLocal

client = TestClient(app)
db = SessionLocal()

try:
    berline = db.query(models.User).filter(models.User.email == "berline@gmail.com").first()
    alex = db.query(models.User).filter(models.User.id == 2).first()

    print(f"Berline user: ID={berline.id if berline else 'N/A'}")
    print(f"Alex user: ID={alex.id if alex else 'N/A'}")

    berline_token = security.create_access_token({"sub": berline.username, "user_id": berline.id, "email": berline.email, "role": berline.role})
    alex_token = security.create_access_token({"sub": alex.username, "user_id": alex.id, "email": alex.email, "role": alex.role})

    def run_check(label, token, conv_id, params, expected_status):
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get(f"/api/conversations/{conv_id}/smart-analysis", params=params, headers=headers)
        print(f"\n[CHECK] {label}")
        print(f"  Status: {resp.status_code} (Expected {expected_status})")
        if resp.status_code == 200:
            data = resp.json()
            print(f"  Mode: {data.get('mode')}, ConvId: {data.get('conversation_id')}, Title: {data.get('title')}")
            print(f"  Summary text length: {len((data.get('summary') or {}).get('text') or '')}")
            print(f"  Tabs present: {[k for k in ['summary', 'key_points', 'important_information', 'what_did_i_miss', 'important_messages', 'action_items', 'decisions', 'dates', 'important_files', 'insights'] if k in data]}")
        else:
            print(f"  Detail: {resp.json().get('detail')}")
        assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"

    print("\n================== RUNNING SMART AUTHORIZATION SUITE ==================")
    # 1. Berline self-chat via Canonical Conv 21
    run_check("1. Berline self-chat via Canonical Conv 21", berline_token, 21, {"conversation_type": "direct"}, 200)

    # 2. Berline self-chat via User ID 90 (The live error bug scenario)
    run_check("2. Berline self-chat via User ID 90", berline_token, 90, {"conversation_type": "direct"}, 200)

    # 3. Berline targeted message 79 via Conv 21
    run_check("3. Berline targeted message 79 via Conv 21", berline_token, 21, {"conversation_type": "direct", "message_id": 79, "include_message": True}, 200)

    # 4. Berline targeted message 79 via User ID 90
    run_check("4. Berline targeted message 79 via User ID 90", berline_token, 90, {"conversation_type": "direct", "message_id": 79, "include_message": True}, 200)

    # 5. Alex valid conversation (Conv 6)
    run_check("5. Alex valid conversation (Conv 6)", alex_token, 6, {"conversation_type": "direct"}, 200)

    # 6. Alex valid conversation via Partner User ID 1
    run_check("6. Alex valid conversation via Partner User ID 1", alex_token, 1, {"conversation_type": "direct"}, 200)

    # 7. Security: Berline accessing unauthorized Conv 1 -> 403 Forbidden
    run_check("7. Security: Berline accessing unauthorized Conv 1", berline_token, 1, {"conversation_type": "direct"}, 403)

    # 8. Security: Berline accessing unauthorized Conv 6 -> 403 Forbidden
    run_check("8. Security: Berline accessing unauthorized Conv 6", berline_token, 6, {"conversation_type": "direct"}, 403)

    # 9. Security: Alex accessing Berline self-chat Conv 21 -> 403 Forbidden
    run_check("9. Security: Alex accessing Berline self-chat Conv 21", alex_token, 21, {"conversation_type": "direct"}, 403)

    # 10. Security: Alex cross-conversation targeted analysis on Message 79 inside Conv 6 -> 403 Forbidden
    run_check("10. Security: Alex cross-conversation targeted on Message 79", alex_token, 6, {"conversation_type": "direct", "message_id": 79, "include_message": True}, 403)

    print("\n======================================================================")
    print("ALL 10 AUTHORIZATION SCENARIOS PASSED WITH 100% SUCCESS!")
    print("======================================================================")
finally:
    db.close()
