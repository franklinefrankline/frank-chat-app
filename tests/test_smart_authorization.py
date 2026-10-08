import urllib.request
import urllib.parse
import json
import sys
import os

sys.path.insert(0, os.path.abspath("backend"))

BASE_URL = "http://127.0.0.1:8000"

import models
import security
from database import SessionLocal

create_access_token = security.create_access_token

db = SessionLocal()
berline = db.query(models.User).filter(models.User.email == "berline@gmail.com").first()
alex = db.query(models.User).filter(models.User.id == 2).first()

print(f"Berline: id={berline.id if berline else None}, email={berline.email if berline else None}")
print(f"Alex: id={alex.id if alex else None}, email={alex.email if alex else None}")

# Generate tokens
berline_token = create_access_token({"sub": berline.username, "user_id": berline.id, "email": berline.email, "role": berline.role})
alex_token = create_access_token({"sub": alex.username, "user_id": alex.id, "email": alex.email, "role": alex.role})

def test_request(name, token, conv_id, params=None, expected_status=200):
    query_str = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{BASE_URL}/api/conversations/{conv_id}/smart-analysis{query_str}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    
    print(f"\n--- {name} ---")
    print(f"URL: {url}")
    try:
        with urllib.request.urlopen(req) as resp:
            status_code = resp.status
            body = resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        status_code = e.code
        body = e.read().decode('utf-8')
    
    print(f"Status: {status_code} (Expected {expected_status})")
    try:
        data = json.loads(body)
        if status_code == 200:
            print(f"Success! Mode: {data.get('mode')}, ConvId: {data.get('conversation_id')}, Title: {data.get('title')}")
            print(f"Summary keys: {[k for k in data.keys() if data[k]]}")
        else:
            print(f"Error detail: {data.get('detail')}")
    except Exception:
        print(f"Raw body: {body[:200]}")
    
    assert status_code == expected_status, f"Expected {expected_status}, got {status_code}"


print("\n=== RUNNING SMART CONVERSATIONS AUTHORIZATION TESTS ===")

# Test 1: Berline self-chat by canonical conversation ID (Conv 21)
test_request("Test 1: Berline self-chat via Canonical Conv 21", berline_token, 21, {"conversation_type": "direct"}, 200)

# Test 2: Berline self-chat by User ID (90) - The exact screenshot bug scenario!
test_request("Test 2: Berline self-chat via User ID 90 (THE CORE BUG FIX)", berline_token, 90, {"conversation_type": "direct"}, 200)

# Test 3: Berline targeted analysis on Message 79 in her self-chat (via Conv 21)
test_request("Test 3: Berline targeted analysis on Message 79 (via Conv 21)", berline_token, 21, {"conversation_type": "direct", "message_id": 79, "include_message": "true"}, 200)

# Test 4: Berline targeted analysis on Message 79 in her self-chat (via User ID 90)
test_request("Test 4: Berline targeted analysis on Message 79 (via User ID 90)", berline_token, 90, {"conversation_type": "direct", "message_id": 79, "include_message": "true"}, 200)

# Test 5: Alex valid conversation with User 1 (Conv 6)
test_request("Test 5: Alex valid conversation (Conv 6)", alex_token, 6, {"conversation_type": "direct"}, 200)

# Test 6: Alex valid conversation via Partner User ID (User 1)
test_request("Test 6: Alex valid conversation via Partner User ID 1", alex_token, 1, {"conversation_type": "direct"}, 200)

# Test 7: SECURITY CHECK - Berline attempting access to Conv 1 (belonging to User 2 and User 3)
# Berline is NOT a member of Conv 1!
test_request("Test 7: SECURITY CHECK - Berline accessing unauthorized Conv 1", berline_token, 1, {"conversation_type": "direct"}, 403)

# Test 8: SECURITY CHECK - Berline attempting access to Conv 6 (belonging to User 1 and User 2)
# Berline is NOT a member of Conv 6!
test_request("Test 8: SECURITY CHECK - Berline accessing unauthorized Conv 6", berline_token, 6, {"conversation_type": "direct"}, 403)

# Test 9: SECURITY CHECK - Alex attempting access to Berline's self-chat Conv 21
test_request("Test 9: SECURITY CHECK - Alex accessing Berline self-chat Conv 21", alex_token, 21, {"conversation_type": "direct"}, 403)

# Test 10: SECURITY CHECK - Alex attempting targeted analysis on Berline's Message 79 inside his own Conv 6
test_request("Test 10: SECURITY CHECK - Alex targeted analysis on cross-conversation message 79", alex_token, 6, {"conversation_type": "direct", "message_id": 79, "include_message": "true"}, 403)

print("\n========================================================")
print("ALL 10 SMART AUTHORIZATION TESTS PASSED WITH 100% SUCCESS!")
print("========================================================")
db.close()
