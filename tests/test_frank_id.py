import sqlite3
import urllib.request
import urllib.error
import json

BASE_URL = "http://127.0.0.1:8000"

def http_req(url, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return e.code, json.loads(err_body) if err_body else {}

def run_tests():
    print("=== STARTING FRANK ID TEST SUITE ===")
    
    # 1. Database Integrity & Uniqueness Test
    print("\n[1] Checking Database Integrity & Uniqueness...")
    conn = sqlite3.connect("backend/chatapp.db")
    cur = conn.cursor()
    
    cur.execute("SELECT id, username, full_name, frank_id FROM users")
    users = cur.fetchall()
    print(f"Total users in DB: {len(users)}")
    
    frank_ids = [u[3] for u in users]
    assert all(fid is not None and len(fid) == 6 for fid in frank_ids), "All users must have a 6-character FRANK ID!"
    assert len(frank_ids) == len(set(frank_ids)), "All users must have UNIQUE FRANK IDs! No duplicates allowed."
    print("[OK] All users have unique, valid 6-character FRANK IDs.")
    
    # 2. Authenticate User (Frank)
    print("\n[2] Authenticating as user 'franklinesamy2006'...")
    status, login_data = http_req(f"{BASE_URL}/api/auth/login", method="POST", data={
        "username": "franklinesamy2006",
        "password": "#Frankline2006"
    })
    assert status == 200, f"Login failed: {login_data}"
    token = login_data["access_token"]
    frank_user = login_data["user"]
    print(f"[OK] Frank logged in: ID={frank_user['id']}, Username={frank_user['username']}, FRANK ID={frank_user['frank_id']}")
    assert frank_user["frank_id"] == "WTW28X", f"Expected WTW28X, got {frank_user['frank_id']}"
    
    # 3. GET /api/conversations Test
    print("\n[3] Testing GET /api/conversations...")
    status, conversations = http_req(f"{BASE_URL}/api/conversations", token=token)
    assert status == 200, f"Failed to get conversations: {conversations}"
    print(f"Fetched {len(conversations)} conversations.")
    
    # Check Berline contact
    berline_conv = next((c for c in conversations if "Berlin" in (c.get("name") or "")), None)
    assert berline_conv is not None, "Berline conversation must be present"
    print(f"[OK] Berline conversation: Name={berline_conv['name']}, FRANK ID={berline_conv.get('frank_id')}")
    assert berline_conv.get("frank_id") == "MGMYYI", f"Expected MGMYYI for Berline, got {berline_conv.get('frank_id')}"
    
    # Check Self-chat ("Frank (You)")
    self_conv = next((c for c in conversations if c.get("id") == frank_user["id"] and c.get("type") == "direct"), None)
    assert self_conv is not None, "Self-chat conversation must be present"
    print(f"[OK] Self-chat conversation: Name={self_conv['name']}, FRANK ID={self_conv.get('frank_id')}")
    assert self_conv.get("frank_id") == frank_user["frank_id"], "Self-chat must display user's own FRANK ID"
    
    # 4. GET /api/conversations/{id} Test
    print("\n[4] Testing GET /api/conversations/{conversation_id}...")
    status, details = http_req(f"{BASE_URL}/api/conversations/{berline_conv['conversation_id']}", token=token)
    assert status == 200, f"Failed to get conversation details: {details}"
    partner = details.get("partner")
    assert partner is not None, "Partner must be present in conversation details"
    print(f"[OK] Partner in conversation details: Name={partner['full_name']}, FRANK ID={partner.get('frank_id')}")
    assert partner.get("frank_id") == "MGMYYI", f"Expected MGMYYI, got {partner.get('frank_id')}"
    
    # 5. Profile & Security Test (Ensure password/hash is not exposed)
    print("\n[5] Checking security & data isolation...")
    assert "password" not in partner, "Password must not be exposed"
    assert "password_hash" not in partner, "Password hash must not be exposed"
    assert "token" not in partner, "Token must not be exposed"
    print("[OK] No sensitive credentials or secrets exposed in partner data.")
    
    # 6. Lookup User by FRANK ID: GET /api/users/frank/{frank_id}
    print("\n[6] Testing GET /api/users/frank/MGMYYI...")
    status, lookup_user = http_req(f"{BASE_URL}/api/users/frank/MGMYYI", token=token)
    assert status == 200, f"Lookup failed: {lookup_user}"
    print(f"[OK] Lookup successful: {lookup_user['full_name']} (@{lookup_user['username']}), FRANK ID={lookup_user['frank_id']}")
    assert lookup_user["frank_id"] == "MGMYYI"
    assert "password" not in lookup_user and "password_hash" not in lookup_user
    
    # 7. Persistence across repeat logins
    print("\n[7] Verifying FRANK ID persistence across new login session...")
    status, login_res2 = http_req(f"{BASE_URL}/api/auth/login", method="POST", data={
        "username": "franklinesamy2006",
        "password": "#Frankline2006"
    })
    assert status == 200
    frank_user2 = login_res2["user"]
    assert frank_user2["frank_id"] == frank_user["frank_id"], "FRANK ID must remain constant across logins!"
    print(f"[OK] FRANK ID is persistent: {frank_user2['frank_id']} == {frank_user['frank_id']}")
    
    # 8. Authenticate another user (Frankline) and verify unique IDs
    print("\n[8] Logging in as second user 'frankline' to verify ID uniqueness...")
    status, second_login = http_req(f"{BASE_URL}/api/auth/login", method="POST", data={
        "username": "frankline",
        "password": "#Frankline2006"
    })
    assert status == 200
    second_user = second_login["user"]
    assert second_user["frank_id"] in ["ADM001", "233IK9"]
    assert second_user["frank_id"] != frank_user["frank_id"], "Different users must NEVER have the same ID"
    print(f"[OK] User 2 FRANK ID ({second_user['frank_id']}) != User 1 FRANK ID ({frank_user['frank_id']})")
    
    print("\n=== ALL TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_tests()
