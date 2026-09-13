import urllib.request
import json

# 1. Login
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/auth/login',
    data=json.dumps({'username': 'alex', 'password': 'password123'}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode('utf-8'))['access_token']

# 2. Upload dummy mp4
boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
lines = [
    f'--{boundary}',
    'Content-Disposition: form-data; name="file"; filename="demo_chat.mp4"',
    'Content-Type: video/mp4',
    '',
    'MP4_VIDEO_HEADER_AND_STREAM_SIMULATION_BYTES_0123456789',
    f'--{boundary}--',
    ''
]
body = '\r\n'.join(lines).encode('utf-8')

upload_req = urllib.request.Request(
    'http://127.0.0.1:8000/api/files/upload',
    data=body,
    headers={
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Authorization': f'Bearer {token}'
    }
)
with urllib.request.urlopen(upload_req) as resp:
    doc = json.loads(resp.read().decode('utf-8'))
    print(f"[PASS] Video uploaded: ID={doc['id']}, Name={doc['original_filename']}, MIME={doc['mime_type']}, Category={doc['file_type']}")
    assert doc['file_type'] == 'video', f"Expected category 'video', got {doc['file_type']}"
    assert doc['mime_type'] == 'video/mp4', f"Expected MIME 'video/mp4', got {doc['mime_type']}"

# 3. View/stream video
view_req = urllib.request.Request(
    f'http://127.0.0.1:8000/api/files/{doc["id"]}/view',
    headers={'Authorization': f'Bearer {token}'}
)
with urllib.request.urlopen(view_req) as resp:
    headers = dict(resp.headers)
    print(f"[PASS] View response: Accept-Ranges={headers.get('accept-ranges')}, Content-Type={headers.get('content-type')}")
    assert headers.get('accept-ranges') == 'bytes', "Accept-Ranges header missing or incorrect"

print("ALL VIDEO UPLOAD & STREAMING TESTS PASSED!")
