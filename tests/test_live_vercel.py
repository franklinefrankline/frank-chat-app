import urllib.request
import json
import os

BASE = "https://frank-chat-app.vercel.app"

def test_live():
    print("Testing Live Vercel deployment at:", BASE)
    unique = os.urandom(3).hex()
    reg_data = json.dumps({
        "username": f"live_user_{unique}",
        "email": f"live_{unique}@example.com",
        "full_name": "Live Vercel User",
        "password": "Password123!"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE}/api/auth/register",
        data=reg_data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        token = res["access_token"]
        user = res["user"]
        print(f"[PASS] 1. Live Registration: {user['username']}, FRANK ID: {user['frank_id']}")

    # Multipart upload
    boundary = "----TestBoundary" + os.urandom(8).hex()
    file_bytes = b"Hello Vercel live serverless upload!"
    lines = [
        f"--{boundary}".encode(),
        b'Content-Disposition: form-data; name="file"; filename="test_doc.txt"',
        b"Content-Type: text/plain",
        b"",
        file_bytes,
        f"--{boundary}--".encode(),
        b""
    ]
    body = b"\r\n".join(lines)

    up_req = urllib.request.Request(
        f"{BASE}/api/files/upload",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": f"Bearer {token}"
        }
    )
    try:
        with urllib.request.urlopen(up_req) as resp:
            up_data = json.loads(resp.read().decode())
            file_id = up_data["id"]
            print(f"[PASS] 2. Live File Upload: ID={file_id}, Filename={up_data['original_filename']}, Type={up_data['file_type']}")
    except urllib.error.HTTPError as e:
        print("Upload HTTPError:", e.code, e.headers)
        print("Error body:", e.read().decode())
        raise

    # Test image upload
    img_boundary = "----TestBoundaryImg" + os.urandom(8).hex()
    fake_img = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 300
    img_body = b"\r\n".join([
        f"--{img_boundary}".encode(),
        b'Content-Disposition: form-data; name="file"; filename="photo.jpg"',
        b"Content-Type: image/jpeg",
        b"",
        fake_img,
        f"--{img_boundary}--".encode(),
        b""
    ])
    up_img_req = urllib.request.Request(
        f"{BASE}/api/files/upload",
        data=img_body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={img_boundary}",
            "Authorization": f"Bearer {token}"
        }
    )
    with urllib.request.urlopen(up_img_req) as resp:
        img_data = json.loads(resp.read().decode())
        print(f"[PASS] 5. Live Image Upload: ID={img_data['id']}, Filename={img_data['original_filename']}, Type={img_data['file_type']}")

    # Test audio upload
    audio_boundary = "----TestBoundaryAudio" + os.urandom(8).hex()
    fake_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 100
    audio_body = b"\r\n".join([
        f"--{audio_boundary}".encode(),
        b'Content-Disposition: form-data; name="file"; filename="voice-recording.webm"',
        b"Content-Type: audio/webm",
        b"",
        fake_audio,
        f"--{audio_boundary}--".encode(),
        b""
    ])
    up_audio_req = urllib.request.Request(
        f"{BASE}/api/files/upload",
        data=audio_body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={audio_boundary}",
            "Authorization": f"Bearer {token}"
        }
    )
    with urllib.request.urlopen(up_audio_req) as resp:
        audio_data = json.loads(resp.read().decode())
        print(f"[PASS] 6. Live Audio Upload: ID={audio_data['id']}, Filename={audio_data['original_filename']}, Type={audio_data['file_type']}")

    # Test PDF upload & view
    pdf_boundary = "----TestBoundaryPdf" + os.urandom(8).hex()
    fake_pdf = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
    pdf_body = b"\r\n".join([
        f"--{pdf_boundary}".encode(),
        b'Content-Disposition: form-data; name="file"; filename="report.pdf"',
        b"Content-Type: application/pdf",
        b"",
        fake_pdf,
        f"--{pdf_boundary}--".encode(),
        b""
    ])
    up_pdf_req = urllib.request.Request(
        f"{BASE}/api/files/upload",
        data=pdf_body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={pdf_boundary}",
            "Authorization": f"Bearer {token}"
        }
    )
    with urllib.request.urlopen(up_pdf_req) as resp:
        pdf_data = json.loads(resp.read().decode())
        pdf_id = pdf_data["id"]
        print(f"[PASS] 7. Live PDF Upload: ID={pdf_id}, Filename={pdf_data['original_filename']}, Type={pdf_data['file_type']}")

    view_pdf_req = urllib.request.Request(f"{BASE}/api/files/{pdf_id}/view?token={token}")
    with urllib.request.urlopen(view_pdf_req) as resp:
        print(f"[PASS] 8. Live PDF View: HTTP {resp.status}, Content-Type: {resp.headers.get('Content-Type')}")

    # Test CSV upload & view
    csv_boundary = "----TestBoundaryCsv" + os.urandom(8).hex()
    csv_content = b"Name,Email,Role\nAlex,alex@frank.app,Admin\nSam,sam@frank.app,User\n"
    csv_body = b"\r\n".join([
        f"--{csv_boundary}".encode(),
        b'Content-Disposition: form-data; name="file"; filename="data.csv"',
        b"Content-Type: text/csv",
        b"",
        csv_content,
        f"--{csv_boundary}--".encode(),
        b""
    ])
    up_csv_req = urllib.request.Request(
        f"{BASE}/api/files/upload",
        data=csv_body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={csv_boundary}",
            "Authorization": f"Bearer {token}"
        }
    )
    with urllib.request.urlopen(up_csv_req) as resp:
        csv_data = json.loads(resp.read().decode())
        csv_id = csv_data["id"]
        print(f"[PASS] 9. Live CSV Upload: ID={csv_id}, Filename={csv_data['original_filename']}, Type={csv_data['file_type']}")

    view_csv_req = urllib.request.Request(f"{BASE}/api/files/{csv_id}/view?token={token}")
    with urllib.request.urlopen(view_csv_req) as resp:
        read_csv = resp.read().decode()
        assert "Alex,alex@frank.app,Admin" in read_csv
        print(f"[PASS] 10. Live CSV View: HTTP {resp.status}, Verified Content parsed successfully")

    # Test invalid password login rejection -> 401
    bad_login_data = json.dumps({
        "username": user["username"],
        "password": "WrongPassword999!"
    }).encode("utf-8")
    bad_req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=bad_login_data,
        headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(bad_req)
        assert False, "Expected 401 on bad password"
    except urllib.error.HTTPError as e:
        assert e.code == 401
        print(f"[PASS] 11. Live Auth Rejection: HTTP {e.code} for invalid password")

    print("==================================================")
    print("ALL LIVE VERCEL TESTS PASSED WITH 100% SUCCESS!")
    print("==================================================")


if __name__ == "__main__":
    test_live()
