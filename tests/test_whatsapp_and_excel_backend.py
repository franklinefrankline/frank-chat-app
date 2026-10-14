import sys
import os
import json
import io
import zipfile
import xml.etree.ElementTree as ET
import urllib.request
import urllib.parse
from datetime import datetime

# Add backend to path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)

from security import create_access_token
from database import SessionLocal
import models
from services.office_service import office_service

build_xlsx = office_service.build_xlsx
parse_xlsx = office_service.parse_xlsx

BASE_URL = "http://127.0.0.1:8000"

def make_req(endpoint, method="GET", data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            resp_headers = dict(resp.headers)
            try:
                json_data = json.loads(content.decode("utf-8"))
            except Exception:
                json_data = None
            return resp.status, json_data, content, resp_headers
    except urllib.error.HTTPError as e:
        err_content = e.read()
        try:
            err_json = json.loads(err_content.decode("utf-8"))
        except Exception:
            err_json = None
        return e.code, err_json, err_content, dict(e.headers)

def run_tests():
    print("=" * 70)
    print("  FRANK THINK: WHATSAPP CHAT & EXCEL SEND-TO-CHAT SUITE")
    print("=" * 70)

    db = SessionLocal()
    
    # 1. Setup / ensure test users exist
    u274 = db.query(models.User).filter(models.User.id == 274).first()
    u275 = db.query(models.User).filter(models.User.id == 275).first()
    u276 = db.query(models.User).filter(models.User.id == 276).first()
    
    assert u274, "User 274 not found"
    assert u275, "User 275 not found"
    assert u276, "User 276 not found"

    token274 = create_access_token({"sub": u274.username, "id": u274.id, "email": u274.email, "role": u274.role})
    token275 = create_access_token({"sub": u275.username, "id": u275.id, "email": u275.email, "role": u275.role})
    token276 = create_access_token({"sub": u276.username, "id": u276.id, "email": u276.email, "role": u276.role})

    print(f"\n[AUTH] User 274: {u274.username} ({u274.full_name})")
    print(f"[AUTH] User 275: {u275.username} ({u275.full_name})")
    print(f"[AUTH] User 276: {u276.username} ({u276.full_name})")

    # =========================================================================
    # PART 1: ONE-TO-ONE CHAT
    # =========================================================================
    print("\n--- TEST 1: ONE-TO-ONE MESSAGING (SEND & RECEIVE) ---")
    
    direct_msg_text = f"Test 1-to-1 WhatsApp style message at {datetime.now().isoformat()}"
    status, res, _, _ = make_req("/api/messages", method="POST", data={
        "recipient_id": 275,
        "content": direct_msg_text,
        "message_type": "text"
    }, token=token274)
    
    assert status == 201, f"Expected 201 Created, got {status}: {res}"
    msg1_id = res["id"]
    print(f"  [PASS] Sent 1-to-1 message from 274 to 275 (ID: {msg1_id})")

    # Recipient 275 fetches direct messages
    status, msgs, _, _ = make_req(f"/api/messages/direct/274", method="GET", token=token275)
    assert status == 200, f"Expected 200 OK, got {status}"
    found = [m for m in msgs if m["id"] == msg1_id]
    assert len(found) == 1, "Sent message not found in recipient's message history"
    assert found[0]["content"] == direct_msg_text
    assert found[0]["sender_id"] == 274
    assert found[0]["recipient_id"] == 275
    print("  [PASS] Recipient 275 received exact direct message content and sender_id")

    # Recipient 275 replies
    reply_text = f"Reply from 275 at {datetime.now().isoformat()}"
    status, res_reply, _, _ = make_req("/api/messages", method="POST", data={
        "recipient_id": 274,
        "content": reply_text,
        "message_type": "text",
        "reply_to_id": msg1_id
    }, token=token275)
    assert status == 201, f"Expected 201, got {status}"
    msg2_id = res_reply["id"]
    print(f"  [PASS] Sent reply from 275 to 274 (ID: {msg2_id}, reply_to: {msg1_id})")

    # Sender 274 fetches direct messages
    status, msgs, _, _ = make_req(f"/api/messages/direct/275", method="GET", token=token274)
    assert status == 200
    ids = [m["id"] for m in msgs]
    assert msg1_id in ids and msg2_id in ids, "Both messages must be in conversation history"
    idx1 = ids.index(msg1_id)
    idx2 = ids.index(msg2_id)
    assert idx1 < idx2, "Messages must be in chronological order"
    print("  [PASS] Sender 274 sees both messages in strict chronological order")

    # =========================================================================
    # PART 2: GROUP CHAT & AUTHORIZATION
    # =========================================================================
    print("\n--- TEST 2: GROUP MESSAGING & MEMBERSHIP AUTHORIZATION ---")

    # Create dedicated test group with User 274 as creator
    group_name = f"WhatsApp Group Test {datetime.now().strftime('%H%M%S')}"
    test_group = models.Group(
        name=group_name,
        created_by=274,
        created_at=datetime.utcnow()
    )
    db.add(test_group)
    db.commit()
    db.refresh(test_group)

    # Add 274 as owner, 275 as member
    m1 = models.GroupMember(group_id=test_group.id, user_id=274, role="owner", joined_at=datetime.utcnow())
    m2 = models.GroupMember(group_id=test_group.id, user_id=275, role="member", joined_at=datetime.utcnow())
    db.add_all([m1, m2])
    db.commit()
    print(f"  [PASS] Created group '{group_name}' (ID: {test_group.id}) with members 274 (owner) and 275 (member)")

    # 274 sends message to group
    group_msg1 = f"Welcome to {group_name}! Sent by creator 274."
    status, res, _, _ = make_req("/api/messages", method="POST", data={
        "group_id": test_group.id,
        "content": group_msg1,
        "message_type": "text"
    }, token=token274)
    assert status == 201, f"Expected 201, got {status}: {res}"
    gmsg1_id = res["id"]
    print(f"  [PASS] Group creator 274 sent group message (ID: {gmsg1_id})")

    # 275 sends message to group
    group_msg2 = "Thanks 274, member 275 joined the chat!"
    status, res, _, _ = make_req("/api/messages", method="POST", data={
        "group_id": test_group.id,
        "content": group_msg2,
        "message_type": "text"
    }, token=token275)
    assert status == 201, f"Expected 201, got {status}: {res}"
    gmsg2_id = res["id"]
    print(f"  [PASS] Group member 275 sent group message (ID: {gmsg2_id})")

    # 275 fetches group messages
    status, g_msgs, _, _ = make_req(f"/api/groups/{test_group.id}/messages", method="GET", token=token275)
    assert status == 200, f"Expected 200, got {status}"
    assert len(g_msgs) >= 2
    msg_from_274 = next(m for m in g_msgs if m["id"] == gmsg1_id)
    assert msg_from_274["sender_id"] == 274
    assert msg_from_274["sender"]["username"] == u274.username
    print(f"  [PASS] Member 275 loaded group messages with sender details ({msg_from_274['sender']['full_name']})")

    # Non-member 276 tries to fetch group messages -> Expect 403 Forbidden
    status, res_err, _, _ = make_req(f"/api/groups/{test_group.id}/messages", method="GET", token=token276)
    assert status == 403, f"Expected 403 Forbidden for non-member, got {status}: {res_err}"
    print("  [PASS] Non-member User 276 was denied access (403 Forbidden) to group messages")

    # Non-member 276 tries to send message to group -> Expect 403 Forbidden
    status, res_err, _, _ = make_req("/api/messages", method="POST", data={
        "group_id": test_group.id,
        "content": "Intruder message",
        "message_type": "text"
    }, token=token276)
    assert status == 403, f"Expected 403 Forbidden for non-member sending, got {status}: {res_err}"
    print("  [PASS] Non-member User 276 was denied permission (403 Forbidden) to send to group")

    # =========================================================================
    # PART 3: EXCEL WORKBOOK — EDIT, SAVE & SEND TO CHAT
    # =========================================================================
    print("\n--- TEST 3: EXCEL WORKBOOK EDIT, SAVE & SEND TO CHAT ---")

    # Step A: Build initial valid Excel workbook (.xlsx)
    initial_sheets = {
        "Revenue": [
            ["Quarter", "Units", "Price", "Total Revenue"],
            ["Q1", 100, 50, "=B2*C2"],
            ["Q2", 150, 50, "=B3*C3"],
            ["Total", "", "", "=D2+D3"]
        ]
    }
    initial_xlsx_bytes = build_xlsx(initial_sheets)
    print(f"  [SETUP] Built initial test .xlsx ({len(initial_xlsx_bytes)} bytes)")

    # Create document record for User 274
    doc_record = models.Document(
        uploader_id=274,
        original_filename="Q1_Revenue_Forecast.xlsx",
        stored_filename="q1_revenue_forecast.xlsx",
        file_size=len(initial_xlsx_bytes),
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        file_type="excel",
        file_data=initial_xlsx_bytes,
        current_version_number=1,
        created_at=datetime.utcnow()
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)
    doc_id = doc_record.id
    print(f"  [SETUP] Created Document ID {doc_id} ('{doc_record.original_filename}', v{doc_record.current_version_number})")

    # Verify initial parse
    parsed_v1 = parse_xlsx(initial_xlsx_bytes)
    sheet_v1_data = parsed_v1["sheets"][0]["data"]
    assert sheet_v1_data[1][0] == "Q1"
    assert str(sheet_v1_data[1][1]) == "100"
    print("  [PASS] Verified initial workbook v1 values: Q1, Units: 100")

    # Step B: User 274 edits cell values in FRANK Excel Editor:
    # Cell [1][0]: "Q1-Final-Audited"
    # Cell [1][1]: 350 (updated units)
    # Cell [1][2]: 60 (updated price)
    # Cell [1][3]: "=B2*C2" (evaluated value 21000)
    edited_sheets = [
        {
            "name": "Revenue",
            "data": [
                ["Quarter", "Units", "Price", "Total Revenue"],
                ["Q1-Final-Audited", 350, 60, "21000"],
                ["Q2", 150, 50, "7500"],
                ["Total", "", "", "28500"]
            ],
            "formulas": {
                "D2": "B2*C2",
                "D3": "B3*C3",
                "D4": "D2+D3"
            }
        }
    ]

    # Step C: Save document (saveDocument() API endpoint: POST /api/files/{doc_id}/save)
    status, save_res, _, _ = make_req(f"/api/files/{doc_id}/save", method="POST", data={
        "base_version_number": 1,
        "change_summary": "Audited Q1 Units and Price updates",
        "structured_data": {"sheets": edited_sheets}
    }, token=token274)

    assert status == 200, f"Expected 200 OK from save, got {status}: {save_res}"
    assert save_res["status"] == "saved"
    new_version_num = save_res["version"]["version_number"]
    assert new_version_num == 2, f"Expected version 2, got {new_version_num}"
    print(f"  [PASS] Successfully saved workbook changes -> Version incremented to v{new_version_num}")

    # Verify document record updated in DB
    db.refresh(doc_record)
    assert doc_record.current_version_number == 2
    assert doc_record.file_data is not None

    # Step D: User 274 clicks "Send to Chat" to share with User 275
    status, send_res, _, _ = make_req(f"/api/files/{doc_id}/send-to-conversation", method="POST", data={
        "recipient_id": 275,
        "comment": "Here is the latest audited workbook with Q1 revenue updates!"
    }, token=token274)

    assert status == 200, f"Expected 200 OK from send-to-conversation, got {status}: {send_res}"
    assert send_res["status"] == "sent"
    shared_msg_id = send_res["message_id"]
    print(f"  [PASS] Sent latest workbook to recipient User 275 (Message ID: {shared_msg_id})")

    # Step E: User 275 receives the message in chat
    status, msgs, _, _ = make_req("/api/messages/direct/274", method="GET", token=token275)
    assert status == 200
    shared_msg = next((m for m in msgs if m["id"] == shared_msg_id), None)
    assert shared_msg, "Shared document message not found in recipient's chat"
    assert shared_msg["file_id"] == doc_id
    assert shared_msg["document"]["current_version_number"] == 2
    print(f"  [PASS] Recipient 275 has attachment card referencing Doc ID {doc_id} at version 2")

    # Step F: User 275 downloads the received workbook attachment
    download_endpoint = f"/api/files/{doc_id}/download?v=2"
    status, _, dl_bytes, dl_headers = make_req(download_endpoint, method="GET", token=token275)
    assert status == 200, f"Expected 200 OK from download, got {status}"
    
    # Check cache-control headers on download
    cache_header = dl_headers.get("Cache-Control", dl_headers.get("cache-control", ""))
    assert "no-cache" in cache_header, f"Expected Cache-Control: no-cache, got {cache_header}"
    print(f"  [PASS] Downloaded received attachment ({len(dl_bytes)} bytes) with strict no-cache headers: '{cache_header}'")

    # Step G: Inspect received .xlsx contents to ensure LATEST edits are present
    parsed_received = parse_xlsx(dl_bytes)
    rec_sheet = parsed_received["sheets"][0]["data"]

    cell_q1 = rec_sheet[1][0]
    cell_units = rec_sheet[1][1]
    cell_price = rec_sheet[1][2]
    cell_formula = rec_sheet[1][3]

    print(f"  [INSPECT] Recipient workbook Cell A2 (Quarter): '{cell_q1}'")
    print(f"  [INSPECT] Recipient workbook Cell B2 (Units):   {cell_units}")
    print(f"  [INSPECT] Recipient workbook Cell C2 (Price):   {cell_price}")
    print(f"  [INSPECT] Recipient workbook Cell D2 (Formula): {cell_formula}")

    assert cell_q1 == "Q1-Final-Audited", f"Stale Quarter value! Expected 'Q1-Final-Audited', got '{cell_q1}'"
    assert str(cell_units) == "350", f"Stale Units value! Expected 350, got {cell_units}"
    assert str(cell_price) == "60", f"Stale Price value! Expected 60, got {cell_price}"
    print("  [PASS] Recipient received the EXACT LATEST edited workbook! No stale content!")

    # Step H: Also inspect raw OpenXML sheet1.xml inside zip to verify `<v>` and `<f>` tags
    with zipfile.ZipFile(io.BytesIO(dl_bytes), 'r') as z:
        sheet1_xml = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
        assert "<v>350</v>" in sheet1_xml, "Cell B2 evaluated value missing in OpenXML"
        assert "<v>60</v>" in sheet1_xml, "Cell C2 evaluated value missing in OpenXML"
        assert "<f>B2*C2</f>" in sheet1_xml, "Cell D2 formula missing in OpenXML"
        assert "<v>21000</v>" in sheet1_xml, "Cell D2 evaluated formula result missing in OpenXML"
    print("  [PASS] OpenXML sheet1.xml properly serializes cell values <v> alongside formula <f>")

    # =========================================================================
    # PART 4: SEND UPDATED WORKBOOK TO GROUP CHAT
    # =========================================================================
    print("\n--- TEST 4: SEND UPDATED WORKBOOK TO GROUP CHAT ---")

    # User 274 sends the updated workbook to the test group
    status, send_grp_res, _, _ = make_req(f"/api/files/{doc_id}/send-to-conversation", method="POST", data={
        "group_id": test_group.id,
        "comment": "Audited workbook shared with the group!"
    }, token=token274)

    assert status == 200, f"Expected 200 OK from send to group, got {status}: {send_grp_res}"
    assert send_grp_res["status"] == "sent"
    grp_doc_msg_id = send_grp_res["message_id"]
    print(f"  [PASS] Sent workbook to group {test_group.id} (Message ID: {grp_doc_msg_id})")

    # User 275 loads group messages and verifies document attachment is present
    status, g_msgs, _, _ = make_req(f"/api/groups/{test_group.id}/messages", method="GET", token=token275)
    assert status == 200
    grp_doc_msg = next((m for m in g_msgs if m["id"] == grp_doc_msg_id), None)
    assert grp_doc_msg, "Group document message not found for member 275"
    assert grp_doc_msg["file_id"] == doc_id
    assert grp_doc_msg["document"]["current_version_number"] == 2
    print(f"  [PASS] Group member 275 sees shared document in group chat with version 2")

    db.close()
    print("\n" + "=" * 70)
    print("  ALL TESTS PASSED SUCCESSFULLY! (100% VERIFIED)")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
