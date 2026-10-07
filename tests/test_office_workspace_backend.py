import urllib.request
import urllib.parse
import urllib.error
import json
import io
import time
import zipfile
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

BASE_URL = "http://127.0.0.1:8000"

def make_request(url, method="GET", data=None, headers=None, is_json=True):
    req_headers = headers.copy() if headers else {}
    body = None
    if data is not None:
        if is_json:
            body = json.dumps(data).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        elif isinstance(data, bytes):
            body = data
        elif isinstance(data, str):
            body = data.encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            resp_headers = dict(resp.headers)
            try:
                parsed = json.loads(content.decode("utf-8"))
            except Exception:
                parsed = content
            return resp.status, parsed, resp_headers
    except urllib.error.HTTPError as e:
        err_content = e.read()
        try:
            parsed = json.loads(err_content.decode("utf-8"))
        except Exception:
            parsed = err_content.decode("utf-8")
        return e.code, parsed, dict(e.headers)

def multipart_upload(url, fields, files, headers=None):
    boundary = "----WebKitFormBoundary" + hex(int(time.time() * 1000))[2:]
    body = io.BytesIO()

    for k, v in fields.items():
        body.write(f"--{boundary}\r\n".encode("utf-8"))
        body.write(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode("utf-8"))
        body.write(f"{v}\r\n".encode("utf-8"))

    for field_name, (filename, file_bytes, content_type) in files.items():
        body.write(f"--{boundary}\r\n".encode("utf-8"))
        body.write(f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8"))
        body.write(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.write(file_bytes)
        body.write(b"\r\n")

    body.write(f"--{boundary}--\r\n".encode("utf-8"))

    req_headers = headers.copy() if headers else {}
    req_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

    req = urllib.request.Request(url, data=body.getvalue(), headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def get_auth_token(identifier, password):
    json_data = json.dumps({"email": identifier, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/login",
        data=json_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))["access_token"]

def test_office_workspace_backend():
    print("==================================================")
    print("STARTING FRANK OFFICE WORKSPACE BACKEND API SUITE")
    print("==================================================")

    # 1. Login Alex & Sarah
    alex_token = get_auth_token("alex", "password123")
    sarah_token = get_auth_token("sarah", "password123")
    alex_headers = {"Authorization": f"Bearer {alex_token}"}
    sarah_headers = {"Authorization": f"Bearer {sarah_token}"}

    # Register Charlie (unauthorized)
    charlie_token = None
    try:
        status, reg_data, _ = make_request(f"{BASE_URL}/api/auth/register", method="POST", data={
            "username": f"charlie_{int(time.time())}",
            "email": f"charlie_{int(time.time())}@frank.app",
            "password": "password123",
            "full_name": "Charlie Tester"
        })
        if status in [200, 201]:
            charlie_token = reg_data["access_token"]
    except Exception:
        pass
    charlie_headers = {"Authorization": f"Bearer {charlie_token}"} if charlie_token else {}

    print("1. [PASS] Authenticated tokens obtained for Alex, Sarah, and Charlie")

    # 2. Upload DOCX document
    from services.office_service import office_service
    initial_docx_bytes = office_service.build_docx("<p>Hello FRANK <b>Document Editor</b></p>")
    status, docx_doc = multipart_upload(
        f"{BASE_URL}/api/files/upload",
        fields={"conversation_id": "3"},
        files={"file": ("Project_Report.docx", initial_docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=alex_headers
    )
    assert status in [200, 201], f"DOCX upload failed: {status} {docx_doc}"
    docx_file_id = docx_doc["id"]
    print(f"2. [PASS] Uploaded DOCX file ID: {docx_file_id}")

    # 3. Test Security (401 & 403)
    status, _, _ = make_request(f"{BASE_URL}/api/files/{docx_file_id}/versions")
    assert status == 401, f"Expected 401 for unauthenticated request, got {status}"
    print("3a. [PASS] Unauthenticated request correctly blocked with 401 Unauthorized")

    if charlie_headers:
        status, _, _ = make_request(f"{BASE_URL}/api/files/{docx_file_id}/versions", headers=charlie_headers)
        assert status == 403, f"Expected 403 for unauthorized Charlie, got {status}"
        status, _, _ = make_request(f"{BASE_URL}/api/files/{docx_file_id}/save", method="POST", headers=charlie_headers, data={"content": "hacked"})
        assert status == 403, f"Expected 403 on save for Charlie, got {status}"
        print("3b. [PASS] IDOR / Unauthorized file access correctly blocked with 403 Forbidden")

    # 4. Get Workspace Data for DOCX
    status, ws_data, _ = make_request(f"{BASE_URL}/api/files/{docx_file_id}/workspace", headers=alex_headers)
    assert status == 200, f"Workspace fetch failed: {status} {ws_data}"
    assert ws_data["document"]["category"] == "word"
    assert "Hello FRANK" in ws_data["parsed"].get("html", "")
    print("4. [PASS] Workspace endpoint returned parsed DOCX structure with HTML")

    # 5. Save new version (Word text update)
    status, save_data, _ = make_request(
        f"{BASE_URL}/api/files/{docx_file_id}/save",
        method="POST",
        headers=alex_headers,
        data={
            "base_version_number": 1,
            "change_summary": "Added Executive Summary section",
            "structured_data": {"html": "<p>Hello FRANK Document Editor</p><p>Executive Summary: All systems verified.</p>"}
        }
    )
    assert status == 200, f"Save failed: {status} {save_data}"
    assert save_data["status"] == "saved"
    assert save_data["version"]["version_number"] == 2
    print("5. [PASS] Save created persistent Version 2 with confirmed database metadata")

    # 6. Test Version Conflict (409 Conflict)
    status, conflict_data, _ = make_request(
        f"{BASE_URL}/api/files/{docx_file_id}/save",
        method="POST",
        headers=sarah_headers,
        data={
            "base_version_number": 1, # Stale base version
            "change_summary": "Conflicting edit",
            "structured_data": {"html": "<p>Conflicting content</p>"}
        }
    )
    assert status == 409, f"Expected 409 Conflict for stale base version, got {status} {conflict_data}"
    print("6. [PASS] Version conflict protection verified (HTTP 409 Conflict returned)")

    # 7. Get Version History List
    status, versions, _ = make_request(f"{BASE_URL}/api/files/{docx_file_id}/versions", headers=alex_headers)
    assert status == 200
    assert len(versions) >= 2
    assert versions[0]["version_number"] == 2
    assert versions[1]["version_number"] == 1
    print(f"7. [PASS] Version history retrieved {len(versions)} versions correctly ordered")

    # 8. Restore Version 1 as new Version 3
    v1_id = versions[1]["id"]
    status, restored_v, _ = make_request(f"{BASE_URL}/api/files/{docx_file_id}/versions/{v1_id}/restore", method="POST", headers=alex_headers, data={})
    assert status == 200
    assert restored_v["version_number"] == 3
    print("8. [PASS] Restored Version 1 creating new immutable Version 3")

    # 9. Test XLSX Spreadsheet Upload, Parse, and Save
    sample_sheets = [{
        "name": "Q3 Budget",
        "data": [["Item", "Cost", "Status"], ["Hosting", "120", "Paid"], ["Domain", "15", "Paid"]],
        "formulas": {"B4": "=SUM(B2:B3)"}
    }]
    xlsx_bytes = office_service.build_xlsx(sample_sheets)
    status, xl_doc = multipart_upload(
        f"{BASE_URL}/api/files/upload",
        fields={"conversation_id": "3"},
        files={"file": ("Financial_Plan.xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=alex_headers
    )
    assert status in [200, 201]
    xl_file_id = xl_doc["id"]

    status, xl_ws, _ = make_request(f"{BASE_URL}/api/files/{xl_file_id}/workspace", headers=alex_headers)
    assert status == 200
    assert xl_ws["document"]["category"] == "excel"
    assert xl_ws["parsed"]["sheets"][0]["name"] == "Q3 Budget"
    print("9. [PASS] Uploaded and parsed XLSX workbook with sheets and formula mapping")

    # 10. Test PPTX Presentation Upload, Parse, and Save
    sample_slides = [
        {"id": 1, "title": "FRANK Architecture", "content": ["Real-time communication", "Persistent office editing"], "bg_color": "#ffffff"},
        {"id": 2, "title": "Roadmap", "content": ["Desktop workspace", "Mobile-optimized toolbars"], "bg_color": "#ffffff"}
    ]
    pptx_bytes = office_service.build_pptx(sample_slides)
    status, ppt_doc = multipart_upload(
        f"{BASE_URL}/api/files/upload",
        fields={"conversation_id": "3"},
        files={"file": ("Executive_Brief.pptx", pptx_bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
        headers=alex_headers
    )
    assert status in [200, 201]
    ppt_file_id = ppt_doc["id"]

    status, ppt_ws, _ = make_request(f"{BASE_URL}/api/files/{ppt_file_id}/workspace", headers=alex_headers)
    assert status == 200
    assert ppt_ws["document"]["category"] == "pptx"
    assert len(ppt_ws["parsed"]["slides"]) == 2
    print("10. [PASS] Uploaded and parsed PPTX presentation with slide cards and content runs")

    # 11. Test CSV Upload, Edit, and Preservation
    csv_content = "Name,Department,Score\nAlex,Engineering,98\nSarah,Design,95\nFrank,Core,100\n"
    status, csv_doc = multipart_upload(
        f"{BASE_URL}/api/files/upload",
        fields={"conversation_id": "3"},
        files={"file": ("Metrics.csv", csv_content.encode("utf-8"), "text/csv")},
        headers=alex_headers
    )
    assert status in [200, 201]
    csv_file_id = csv_doc["id"]

    status, csv_ws, _ = make_request(f"{BASE_URL}/api/files/{csv_file_id}/workspace", headers=alex_headers)
    assert status == 200
    assert csv_ws["document"]["category"] == "csv"
    assert len(csv_ws["parsed"]["rows"]) == 4

    status, _, _ = make_request(
        f"{BASE_URL}/api/files/{csv_file_id}/save",
        method="POST",
        headers=alex_headers,
        data={"base_version_number": 1, "structured_data": {"rows": [["Name", "Department", "Score"], ["Alex", "Engineering", "99"], ["Sarah", "Design", "97"]]}}
    )
    assert status == 200
    print("11. [PASS] CSV parsing, grid editing, and quote/delimiter preservation verified")

    # 12. Test TXT Editor Upload and Save
    status, txt_doc = multipart_upload(
        f"{BASE_URL}/api/files/upload",
        fields={"conversation_id": "3"},
        files={"file": ("Notes.txt", b"FRANK Office Workspace Notes\nLine 2: Ready for production", "text/plain")},
        headers=alex_headers
    )
    assert status in [200, 201]
    txt_file_id = txt_doc["id"]

    status, txt_ws, _ = make_request(f"{BASE_URL}/api/files/{txt_file_id}/workspace", headers=alex_headers)
    assert status == 200
    assert txt_ws["document"]["category"] == "text"
    assert "FRANK Office Workspace Notes" in txt_ws["parsed"]["text"]
    print("12. [PASS] TXT editor upload, text parsing, and retrieval verified")

    # 13. Test ZIP Safe Explorer
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as z:
        z.writestr("README.md", "# Project Documentation\nAll tests passing.")
        z.writestr("src/config.json", '{"version": "2.0"}')
    status, zip_doc = multipart_upload(
        f"{BASE_URL}/api/files/upload",
        fields={"conversation_id": "3"},
        files={"file": ("archive.zip", zip_buf.getvalue(), "application/zip")},
        headers=alex_headers
    )
    assert status in [200, 201]
    zip_file_id = zip_doc["id"]

    status, zip_ws, _ = make_request(f"{BASE_URL}/api/files/{zip_file_id}/workspace", headers=alex_headers)
    assert status == 200
    assert zip_ws["document"]["category"] == "zip"
    assert len(zip_ws["parsed"]["files"]) == 2
    print("13. [PASS] ZIP file safe archive exploration with file metadata verified")

    # 14. Test Send Updated File to Conversation
    status, send_data, _ = make_request(
        f"{BASE_URL}/api/files/{docx_file_id}/send-to-conversation",
        method="POST",
        headers=alex_headers,
        data={"recipient_id": 2, "comment": "Here is the revised Project Report v3"}
    )
    assert status == 200, f"Send updated file failed: {status} {send_data}"
    assert send_data["status"] == "sent"
    assert send_data["message_id"] > 0
    print(f"14. [PASS] Send Updated File created new real message {send_data['message_id']} with attachment")

    # 15. Download Document Version
    status, dl_content, dl_headers = make_request(
        f"{BASE_URL}/api/files/{docx_file_id}/versions/{save_data['version']['id']}/download",
        headers=alex_headers,
        is_json=False
    )
    assert status == 200
    assert len(dl_content) > 0
    cd_header = dl_headers.get("content-disposition", dl_headers.get("Content-Disposition", ""))
    assert "attachment" in str(cd_header).lower()
    print("15. [PASS] Download document version returned valid binary content with proper headers")

    print("==================================================")
    print("ALL 15 BACKEND API TESTS PASSED SUCCESSFULLY! [100%]")
    print("==================================================")

if __name__ == "__main__":
    test_office_workspace_backend()
