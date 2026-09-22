import urllib.request
import json
import os
import time

BASE = "https://frank-chat-app.vercel.app"
print("Testing Live Vercel Chunked Upload at:", BASE)

# Register user
suffix = os.urandom(3).hex()
reg_data = json.dumps({
    "username": f"live_chunk_{suffix}",
    "email": f"live_chunk_{suffix}@test.com",
    "full_name": "Live Chunk User",
    "password": "Password123!"
}).encode()

req = urllib.request.Request(f"{BASE}/api/auth/register", data=reg_data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode())["access_token"]
    print("[PASS] 1. Registered user on live Vercel")

# Test uploading 8 MB file in 3 MB chunks (simulating SLN counsulting.zip)
file_size = 8 * 1024 * 1024
fake_bytes = b"PK\x03\x04" + b"C" * (file_size - 4)
chunk_size = 3 * 1024 * 1024
total_chunks = (file_size + chunk_size - 1) // chunk_size
upload_id = f"live_up_{suffix}"

print(f"Uploading 8 MB file in {total_chunks} chunks to live Vercel...")
last_resp = None

for chunk_idx in range(total_chunks):
    start = chunk_idx * chunk_size
    end = min(start + chunk_size, file_size)
    chunk_data = fake_bytes[start:end]

    boundary = "----Boundary" + os.urandom(6).hex()
    body = b"\r\n".join([
        f"--{boundary}".encode(),
        b'Content-Disposition: form-data; name="upload_id"',
        b"",
        upload_id.encode(),
        f"--{boundary}".encode(),
        b'Content-Disposition: form-data; name="chunk_index"',
        b"",
        str(chunk_idx).encode(),
        f"--{boundary}".encode(),
        b'Content-Disposition: form-data; name="total_chunks"',
        b"",
        str(total_chunks).encode(),
        f"--{boundary}".encode(),
        b'Content-Disposition: form-data; name="filename"',
        b"",
        b"SLN counsulting.zip",
        f"--{boundary}".encode(),
        b'Content-Disposition: form-data; name="chunk"; filename="SLN counsulting.zip"',
        b"Content-Type: application/zip",
        b"",
        chunk_data,
        f"--{boundary}--".encode(),
        b""
    ])

    up_req = urllib.request.Request(f"{BASE}/api/files/upload-chunk", data=body, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": f"Bearer {token}"
    })

    with urllib.request.urlopen(up_req) as resp:
        last_resp = json.loads(resp.read().decode())
        print(f"  Live Chunk {chunk_idx + 1}/{total_chunks} HTTP {resp.status} resp={last_resp}")

print("[PASS] 2. Live Chunked Upload Completed on Vercel!")
print("Doc ID:", last_resp.get("id"), "Filename:", last_resp.get("original_filename"), "Size:", last_resp.get("file_size"))
assert last_resp["original_filename"] == "SLN counsulting.zip"
assert last_resp["file_size"] == file_size

# Verify download
doc_id = last_resp["id"]
view_req = urllib.request.Request(f"{BASE}/api/files/{doc_id}/view?token={token}")
try:
    with urllib.request.urlopen(view_req) as resp:
        content_len = len(resp.read())
        print(f"[PASS] 3. Live File View: HTTP {resp.status} Length: {content_len}")
except urllib.error.HTTPError as e:
    print(f"View HTTPError: {e.code} Body: {e.read().decode()}")
    raise

print("\n======================================================")
print("LIVE VERCEL CHUNKED UPLOAD TEST PASSED WITH 100% SUCCESS!")
print("======================================================")
