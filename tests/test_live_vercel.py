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

    # Test viewing
    view_req = urllib.request.Request(f"{BASE}/api/files/{file_id}/view?token={token}")
    with urllib.request.urlopen(view_req) as resp:
        disposition = resp.headers.get("Content-Disposition")
        print(f"[PASS] 3. Live File View: HTTP {resp.status}, Content-Disposition: {disposition}")

    # Test downloading
    down_req = urllib.request.Request(f"{BASE}/api/files/{file_id}/download?token={token}")
    try:
        with urllib.request.urlopen(down_req) as resp:
            disposition = resp.headers.get("Content-Disposition")
            print(f"[PASS] 4. Live File Download: HTTP {resp.status}, Content-Disposition: {disposition}")
    except urllib.error.HTTPError as e:
        print("Download HTTPError:", e.code, e.read().decode())
        raise

    print("==================================================")
    print("ALL LIVE VERCEL TESTS PASSED WITH 100% SUCCESS!")
    print("==================================================")


if __name__ == "__main__":
    test_live()
