import os
import sys
import zipfile
import io
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from database import SessionLocal
import models
from security import create_access_token

BASE_URL = "http://127.0.0.1:8000"

def test_word_backend_suite():
    print("==================================================================")
    print("STARTING FRANK WORD EDITOR COMPLETE BACKEND API VERIFICATION SUITE")
    print("==================================================================")

    db = SessionLocal()
    user_a = db.query(models.User).filter_by(id=1).first()
    user_b = db.query(models.User).filter_by(id=2).first()
    assert user_a and user_b, "Database users missing"

    token_a = create_access_token({"sub": str(user_a.id), "id": user_a.id, "email": user_a.email})
    token_b = create_access_token({"sub": str(user_b.id), "id": user_b.id, "email": user_b.email})

    print(f"[PASS] Generated valid tokens for User A ({user_a.username}, ID {user_a.id}) and User B ({user_b.username}, ID {user_b.id})")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    client = httpx.Client(base_url=BASE_URL, timeout=10.0)

    # 1. Test create new document endpoint
    print("\n--- 1. CREATE NEW WORD DOCUMENT ---")
    new_doc_res = client.post("/api/files/new-document", json={
        "title": "Quarterly Operations Plan",
        "format": "docx",
        "template": "blank"
    }, headers=headers_a)
    assert new_doc_res.status_code == 200, f"New doc creation failed: {new_doc_res.text}"
    doc_data = new_doc_res.json()
    doc_id = doc_data["id"]
    print(f"[PASS] Created new document: ID {doc_id}, filename: {doc_data['original_filename']}")
    assert doc_data["original_filename"] == "Quarterly Operations Plan.docx"
    assert doc_data["current_version_number"] == 1

    # 2. Test workspace fetch (initial document model)
    print("\n--- 2. FETCH WORKSPACE FOR INITIAL DOCUMENT ---")
    ws_res = client.get(f"/api/files/{doc_id}/workspace", headers=headers_a)
    assert ws_res.status_code == 200, f"Workspace fetch failed: {ws_res.text}"
    ws_data = ws_res.json()
    assert "parsed" in ws_data
    assert "html" in ws_data["parsed"]
    print(f"[PASS] Workspace loaded parsed HTML ({len(ws_data['parsed']['html'])} chars)")

    # 3. Save rich document edits (Headings, alignment, formatting, table, page break, image)
    print("\n--- 3. SAVE RICH WORD DOCUMENT EDITS ---")
    rich_html = """
    <h1 style="text-align: center;">Executive Operations Summary</h1>
    <p>This is a <strong>bold statement</strong> and <em>italic note</em> with <u>underlined goals</u> and <s>deprecated items</s>.</p>
    <p style="text-align: right; color: #B86B3D;">Sandstone Brown Accent Subtitle</p>
    <h2>Key Strategic Milestones</h2>
    <ul>
        <li>Deliver real Microsoft Word compatible editor.</li>
        <li>Preserve typography, alignments, and lists.</li>
        <li>Ensure safe multi-version persistence.</li>
    </ul>
    <h2>Quarterly Financial Performance</h2>
    <table border="1" style="width:100%; border-collapse:collapse;">
        <thead>
            <tr><th>Metric</th><th>Q1 Actual</th><th>Target</th></tr>
        </thead>
        <tbody>
            <tr><td>User Adoption</td><td>98.4%</td><td>95.0%</td></tr>
            <tr><td>Data Integrity</td><td>100.0%</td><td>100.0%</td></tr>
        </tbody>
    </table>
    <div class="word-page-break">PAGE BREAK</div>
    <h1>Section 2 — Technical Specifications</h1>
    <p>This section is on Page 2 after a genuine document page break.</p>
    """
    save_res = client.post(f"/api/files/{doc_id}/save", json={
        "base_version_number": 1,
        "change_summary": "Added Executive Operations Summary with table, formatting and page break",
        "structured_data": {"html": rich_html}
    }, headers=headers_a)
    assert save_res.status_code == 200, f"Save failed: {save_res.text}"
    save_data = save_res.json()
    assert save_data["status"] == "saved"
    assert save_data["version"]["version_number"] == 2
    print(f"[PASS] Successfully saved Version 2 (Version number confirmed: {save_data['version']['version_number']})")

    # 4. Fetch updated workspace and verify HTML round-trip
    print("\n--- 4. VERIFY RE-FETCH OF SAVED DOCUMENT ---")
    ws_res_2 = client.get(f"/api/files/{doc_id}/workspace", headers=headers_a)
    assert ws_res_2.status_code == 200
    html_2 = ws_res_2.json()["parsed"]["html"]
    assert "Executive Operations Summary" in html_2
    assert "Quarterly Financial Performance" in html_2
    assert "User Adoption" in html_2
    assert "word-page-break" in html_2 or "Technical Specifications" in html_2
    print("[PASS] Re-opened workspace reflects all rich content, table rows, and headings!")

    # 5. Test downloading generated .docx and verify OpenXML structure
    print("\n--- 5. DOWNLOAD GENERATED .DOCX AND VALIDATE OPENXML ARCHITECTURE ---")
    dl_res = client.get(f"/api/files/{doc_id}/download", headers=headers_a)
    assert dl_res.status_code == 200, f"Download failed: {dl_res.status_code}"
    docx_bytes = dl_res.content
    assert len(docx_bytes) > 500, "DOCX file too small"

    # Inspect zipfile package
    zf = zipfile.ZipFile(io.BytesIO(docx_bytes))
    namelist = zf.namelist()
    assert "[Content_Types].xml" in namelist, "Missing [Content_Types].xml"
    assert "word/document.xml" in namelist, "Missing word/document.xml"
    assert "_rels/.rels" in namelist, "Missing root rels"

    doc_xml_content = zf.read("word/document.xml").decode("utf-8")
    assert "Executive Operations Summary" in doc_xml_content
    assert "Key Strategic Milestones" in doc_xml_content
    assert "Quarterly Financial Performance" in doc_xml_content
    assert "w:tbl" in doc_xml_content, "OpenXML table element <w:tbl> missing!"
    assert "w:b" in doc_xml_content, "Bold run <w:b/> missing!"
    assert "w:i" in doc_xml_content, "Italic run <w:i/> missing!"
    assert "w:br" in doc_xml_content and 'w:type="page"' in doc_xml_content, "Page break <w:br w:type='page'/> missing!"
    print(f"[PASS] Validated OpenXML Package: {len(docx_bytes)} bytes, contains <w:tbl>, <w:b>, <w:i>, and <w:br w:type='page'>")

    # 6. Test rename document
    print("\n--- 6. TEST DOCUMENT RENAME ---")
    rename_res = client.put(f"/api/files/{doc_id}/rename", json={
        "filename": "Strategic_Plan_2026.docx"
    }, headers=headers_a)
    assert rename_res.status_code == 200, f"Rename failed: {rename_res.text}"
    assert rename_res.json()["original_filename"] == "Strategic_Plan_2026.docx"
    print("[PASS] Document successfully renamed to Strategic_Plan_2026.docx")

    # 7. Test Save As (Copy)
    print("\n--- 7. TEST SAVE AS (INDEPENDENT COPY) ---")
    save_as_res = client.post(f"/api/files/{doc_id}/save-as", json={
        "filename": "Copy_of_Strategic_Plan.docx",
        "structured_data": {"html": rich_html}
    }, headers=headers_a)
    assert save_as_res.status_code == 200, f"Save As failed: {save_as_res.text}"
    copy_doc = save_as_res.json()
    assert copy_doc["id"] != doc_id
    assert copy_doc["original_filename"] == "Copy_of_Strategic_Plan.docx"
    print(f"[PASS] Created distinct copy document ID {copy_doc['id']} (Original doc ID {doc_id} preserved)")

    # 8. Test Security & Authorization boundary
    print("\n--- 8. TEST SECURITY & PERMISSIONS BOUNDARY ---")
    unauth_ws = client.get(f"/api/files/{doc_id}/workspace", headers=headers_b)
    # User B should NOT have access to User A's private document
    assert unauth_ws.status_code in (403, 404), f"Security breach: unauthorized user got {unauth_ws.status_code}"
    print(f"[PASS] Unauthorized User B correctly blocked from accessing User A's private doc (HTTP {unauth_ws.status_code})")

    # 9. Test Send to Chat workflow (Share doc into conversation)
    print("\n--- 9. TEST SEND TO CHAT / MESSAGE ATTACHMENT ---")
    chat_msg_res = client.post("/api/messages", json={
        "recipient_id": user_b.id,
        "content": "Sarah, please find attached the updated Strategic Plan.",
        "file_id": doc_id
    }, headers=headers_a)
    assert chat_msg_res.status_code in (200, 201), f"Send to chat failed: {chat_msg_res.text}"
    msg_data = chat_msg_res.json()
    assert msg_data["file_id"] == doc_id
    print(f"[PASS] Successfully sent saved document to chat with User B! Message ID: {msg_data['id']}")

    print("\n==================================================================")
    print("ALL WORD EDITOR BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("==================================================================")

if __name__ == "__main__":
    test_word_backend_suite()
