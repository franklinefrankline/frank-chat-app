import urllib.request
import json
import asyncio
from datetime import datetime, timezone

BASE_URL = "http://127.0.0.1:8000"

def request_json(url, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    print("Testing live QENVO server at", BASE_URL)
    
    # 1. Login as Alex
    login_res = request_json(f"{BASE_URL}/api/auth/login", method="POST", data={
        "username": "alex",
        "password": "password123"
    })
    token = login_res["access_token"]
    user = login_res["user"]
    print(f"[OK] Logged in as {user['full_name']} (ID: {user['id']})")
    
    # 2. Get Sarah's user ID
    users = request_json(f"{BASE_URL}/api/users", token=token)
    sarah = next(u for u in users if u["username"] == "sarah")
    print(f"[OK] Target partner Sarah found (ID: {sarah['id']})")
    
    # 3. Send message via REST
    test_content = "Live timestamp verification test"
    msg_res = request_json(f"{BASE_URL}/api/messages", method="POST", data={
        "recipient_id": sarah["id"],
        "content": test_content,
        "message_type": "text"
    }, token=token)
    
    msg_id = msg_res["id"]
    created_at = msg_res["created_at"]
    print(f"[OK] Message sent (ID: {msg_id})")
    print(f"     created_at: {created_at}")
    assert created_at.endswith("Z"), f"created_at must end with Z: {created_at}"
    assert msg_res.get("updated_at") is None, "New message updated_at must be None"
    
    # 4. Fetch direct message history
    history = request_json(f"{BASE_URL}/api/messages/direct/{sarah['id']}", token=token)
    found = next((m for m in history if m["id"] == msg_id), None)
    assert found is not None, "Sent message not found in history"
    assert found["created_at"] == created_at, "History created_at does not match sent created_at"
    print(f"[OK] Message history retrieved: timestamp preserved ({found['created_at']})")
    
    # Verify sorting in history
    for i in range(len(history) - 1):
        dt1 = history[i]["created_at"]
        dt2 = history[i+1]["created_at"]
        assert dt1 <= dt2, f"History not sorted chronologically: {dt1} > {dt2}"
    print(f"[OK] History chronologically sorted: {len(history)} messages verified")
    
    # 5. Edit message via REST
    updated_content = "Live timestamp verification test (Edited)"
    edit_res = request_json(f"{BASE_URL}/api/messages/{msg_id}", method="PUT", data={
        "content": updated_content
    }, token=token)
    
    assert edit_res["id"] == msg_id
    assert edit_res["content"] == updated_content
    assert edit_res["created_at"] == created_at, "created_at changed upon editing! Must be preserved."
    assert edit_res["updated_at"] is not None, "updated_at not set"
    assert edit_res["updated_at"].endswith("Z"), f"updated_at must end with Z: {edit_res['updated_at']}"
    print(f"[OK] Message edited successfully:")
    print(f"     created_at (preserved): {edit_res['created_at']}")
    print(f"     updated_at (edit time): {edit_res['updated_at']}")
    
    # 6. Verify conversations endpoint
    convs = request_json(f"{BASE_URL}/api/users/conversations", token=token)
    sarah_conv = next((c for c in convs if c.get("id") == sarah["id"] and c.get("type") == "direct"), None)
    if sarah_conv and sarah_conv.get("last_message"):
        lm = sarah_conv["last_message"]
        assert lm["created_at"].endswith("Z"), f"last_message created_at must end with Z: {lm['created_at']}"
        print(f"[OK] Conversation preview timestamp verified: {lm['created_at']}")
    
    # 7. Clean up test message
    request_json(f"{BASE_URL}/api/messages/{msg_id}", method="DELETE", token=token)
    print(f"[OK] Test message cleaned up")
    
    print("\nALL LIVE TIMESTAMP AND EDIT TESTS PASSED WITH 100% ACCURACY!")

if __name__ == "__main__":
    main()
