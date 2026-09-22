import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
from main import app
from database import get_db, Base, engine
import models

# Ensure tables exist
Base.metadata.create_all(bind=engine)

client = TestClient(app)

def test_chunked_upload_zip_and_video():
    print("Testing Chunked Upload for >10MB and >45MB files...")

    # 1. Register test user
    suffix = os.urandom(3).hex()
    reg = client.post("/api/auth/register", json={
        "username": f"chunk_user_{suffix}",
        "email": f"chunk_{suffix}@test.com",
        "full_name": "Chunk User",
        "password": "Password123!"
    })
    assert reg.status_code == 201, f"Reg failed: {reg.text}"
    token = reg.json()["access_token"]
    user_id = reg.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"[PASS] 1. Registered test user: {user_id}")

    # 2. Test 10.6 MB zip file chunked upload ("SLN counsulting.zip")
    zip_size = int(10.6 * 1024 * 1024)
    fake_zip_bytes = b"PK\x03\x04" + b"Z" * (zip_size - 4)
    chunk_size = 3 * 1024 * 1024 # 3 MB
    total_chunks = (zip_size + chunk_size - 1) // chunk_size
    upload_id = f"test_up_zip_{suffix}"

    print(f"Uploading 10.6 MB ZIP in {total_chunks} chunks of 3MB...")
    last_res = None
    for chunk_idx in range(total_chunks):
        start = chunk_idx * chunk_size
        end = min(start + chunk_size, zip_size)
        chunk_slice = fake_zip_bytes[start:end]

        data = {
            "upload_id": upload_id,
            "chunk_index": str(chunk_idx),
            "total_chunks": str(total_chunks),
            "filename": "SLN counsulting.zip"
        }
        files = {
            "chunk": ("SLN counsulting.zip", chunk_slice, "application/zip")
        }

        resp = client.post("/api/files/upload-chunk", data=data, files=files, headers=headers)
        assert resp.status_code == 200, f"Chunk {chunk_idx} failed: {resp.status_code} {resp.text}"
        last_res = resp.json()
        if chunk_idx < total_chunks - 1:
            assert last_res.get("status") == "chunk_received", f"Unexpected intermediate status: {last_res}"
            print(f"  Chunk {chunk_idx + 1}/{total_chunks} received OK")
        else:
            print(f"  Final chunk {chunk_idx + 1}/{total_chunks} completed!")

    assert "id" in last_res, f"Expected DocumentResponse on final chunk: {last_res}"
    zip_doc_id = last_res["id"]
    assert last_res["original_filename"] == "SLN counsulting.zip"
    assert last_res["file_size"] == zip_size
    assert last_res["file_type"] == "archive"
    print(f"[PASS] 2. 10.6 MB ZIP chunked upload succeeded: DocID={zip_doc_id}, Filename='{last_res['original_filename']}', Size={last_res['file_size']}")

    # 3. View/download the assembled 10.6 MB zip
    view_resp = client.get(f"/api/files/{zip_doc_id}/view?token={token}")
    assert view_resp.status_code == 200, f"View failed: {view_resp.status_code}"
    assert len(view_resp.content) == zip_size
    print(f"[PASS] 3. 10.6 MB ZIP verified intact on view/download: {len(view_resp.content)} bytes")

    # 4. Test 47.4 MB MP4 video chunked upload ("0829(2).mp4")
    vid_size = int(47.4 * 1024 * 1024)
    # MP4 ftyp box header
    fake_vid_bytes = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42" + b"V" * (vid_size - 24)
    total_vid_chunks = (vid_size + chunk_size - 1) // chunk_size
    vid_upload_id = f"test_up_vid_{suffix}"

    print(f"Uploading 47.4 MB MP4 video in {total_vid_chunks} chunks of 3MB...")
    last_vid_res = None
    for chunk_idx in range(total_vid_chunks):
        start = chunk_idx * chunk_size
        end = min(start + chunk_size, vid_size)
        chunk_slice = fake_vid_bytes[start:end]

        data = {
            "upload_id": vid_upload_id,
            "chunk_index": str(chunk_idx),
            "total_chunks": str(total_vid_chunks),
            "filename": "0829(2).mp4"
        }
        files = {
            "chunk": ("0829(2).mp4", chunk_slice, "video/mp4")
        }

        resp = client.post("/api/files/upload-chunk", data=data, files=files, headers=headers)
        assert resp.status_code == 200, f"Video chunk {chunk_idx} failed: {resp.status_code} {resp.text}"
        last_vid_res = resp.json()

    assert "id" in last_vid_res, f"Expected DocumentResponse on final video chunk: {last_vid_res}"
    vid_doc_id = last_vid_res["id"]
    assert last_vid_res["original_filename"] == "0829(2).mp4"
    assert last_vid_res["file_size"] == vid_size
    assert last_vid_res["file_type"] == "video"
    print(f"[PASS] 4. 47.4 MB Video chunked upload succeeded: DocID={vid_doc_id}, Filename='{last_vid_res['original_filename']}', Size={last_vid_res['file_size']}")

    # 5. Verify partial content streaming on the 47.4 MB video
    stream_headers = {"Range": "bytes=0-1048575", "Authorization": f"Bearer {token}"}
    stream_resp = client.get(f"/api/files/{vid_doc_id}/view?token={token}", headers=stream_headers)
    assert stream_resp.status_code in [200, 206], f"Stream view failed: {stream_resp.status_code}"
    print(f"[PASS] 5. 47.4 MB Video streaming response verified: HTTP {stream_resp.status_code}")

    print("\n=======================================================")
    print("ALL CHUNKED UPLOAD TESTS PASSED WITH 100% SUCCESS!")
    print("=======================================================")

if __name__ == "__main__":
    test_chunked_upload_zip_and_video()
