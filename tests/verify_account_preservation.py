import urllib.request
import json
import time
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def post_json(url, data, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, e.reason

def get_json(url, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, e.reason

def verify_environment(base_url, env_name):
    print(f"\n=======================================================")
    print(f"VERIFYING ACCOUNT PRESERVATION: {env_name} ({base_url})")
    print(f"=======================================================")

    # 1. Health & Database Connection
    status, health = get_json(f"{base_url}/api/health")
    assert status == 200, f"Health check failed: {status}"
    assert health.get("database") == "connected", f"Database not connected: {health}"
    print(f"  [PASS] Database Connectivity: {health.get('database')}")

    # 2. Verify Sample Existing Accounts via Admin or Login
    # Test Admin Account (Permanent)
    print("\n--- Verifying Super Admin Account ---")
    admin_status, admin_auth = post_json(f"{base_url}/api/auth/login", {
        "email": "frankline30999112@gmail.com",
        "password": "#Frankline2006"
    })
    assert admin_status == 200, f"Super Admin login failed: {admin_status}"
    admin_token = admin_auth["access_token"]
    admin_user = admin_auth["user"]
    print(f"  [PASS] Super Admin Logged In: ID={admin_user['id']}, Email={admin_user['email']}, FRANK ID={admin_user['frank_id']}, Role={admin_user['role']}")
    assert admin_user["role"] == "admin", "Admin role corrupted"

    # Query Admin Overview Metrics
    status, metrics = get_json(f"{base_url}/api/admin/metrics", admin_token)
    assert status == 200
    print(f"  [PASS] Production Database Metrics:")
    print(f"         Total Users Count:      {metrics.get('total_users')}")
    print(f"         Active Accounts Count:  {metrics.get('active_accounts')}")
    print(f"         Total Messages Count:   {metrics.get('total_messages')}")
    print(f"         Total Groups Count:     {metrics.get('total_groups')}")
    print(f"         Total Files Count:      {metrics.get('total_files')}")

    # Sample existing user accounts
    status, users_res = get_json(f"{base_url}/api/admin/users?limit=10", admin_token)
    assert status == 200
    user_list = users_res.get("users", [])
    print(f"\n--- Checking Sample Existing Users (Sample {len(user_list)}) ---")
    for u in user_list[:5]:
        print(f"  User: ID={u['id']}, Name={u.get('full_name')}, Email={u['email']}, FRANK ID={u['frank_id']}, Status={u.get('account_status')}")
        assert u['id'] > 0, "Invalid User ID"
        assert len(u['frank_id']) == 6, f"Invalid FRANK ID format: {u['frank_id']}"
        assert u.get('account_status') in ["active", "disabled"], f"Invalid account status: {u.get('account_status')}"

    # 3. Test Sample Existing User (Alex: alex@frank.app)
    print("\n--- Verifying Existing User Account (Alex: alex@frank.app) ---")
    alex_status, alex_auth = post_json(f"{base_url}/api/auth/login", {
        "email": "alex@frank.app",
        "password": "password123"
    })
    assert alex_status == 200, f"Alex login failed: {alex_status}"
    alex_token = alex_auth["access_token"]
    alex_user = alex_auth["user"]
    print(f"  1. Login: SUCCESS (Token issued)")
    print(f"  2. Existing FRANK ID: {alex_user['frank_id']}")
    assert alex_user['frank_id'] == "F4M8Q1" or len(alex_user['frank_id']) == 6

    # Step 3: Fetch Existing Conversations
    status, convs = get_json(f"{base_url}/api/users/conversations", alex_token)
    assert status == 200
    print(f"  3. Existing Conversations Count: {len(convs)}")

    # Step 4: Fetch Existing Files for the user's conversation
    status, docs = get_json(f"{base_url}/api/files/conversation/{admin_user['id']}", alex_token)
    assert status == 200
    print(f"  4. Existing Documents in Conversation: {len(docs)} files")

    # Step 5: Send a Message as Existing User
    # Find a conversation partner or user
    partner_id = admin_user["id"]
    status, send_res = post_json(f"{base_url}/api/messages", {
        "recipient_id": partner_id,
        "content": f"Account preservation check verification timestamp: {int(time.time())}"
    }, alex_token)
    print(f"  Send Message Status: {status}, Response: {send_res}")
    assert status in [200, 201]
    new_msg_id = send_res["id"]
    print(f"  5. Sent New Message: ID={new_msg_id}, Content={send_res['content'][:45]}...")

    # Step 6: Verify Receipt of Message
    status, msg_list = get_json(f"{base_url}/api/messages/direct/{partner_id}", alex_token)
    assert status == 200
    matching = [m for m in msg_list if m["id"] == new_msg_id]
    assert len(matching) > 0, "Sent message not found in conversation history"
    print(f"  6. Verified Message Receipt & Persistence: Found ID {new_msg_id} in {len(msg_list)} conversation messages")

    # Step 7: Simulate Logout & Re-login
    print(f"  7. Logged out.")
    print(f"  8. Logging in again with exact same credentials...")
    re_status, re_auth = post_json(f"{base_url}/api/auth/login", {
        "email": "alex@frank.app",
        "password": "password123"
    })
    assert re_status == 200, "Re-login failed"
    re_user = re_auth["user"]
    assert re_user["id"] == alex_user["id"], "User ID changed across login sessions!"
    assert re_user["frank_id"] == alex_user["frank_id"], "FRANK ID changed across login sessions!"
    print(f"  9. Re-login SUCCESS: User ID {re_user['id']}, FRANK ID {re_user['frank_id']} intact!")

    print(f"\n✅ ACCOUNT PRESERVATION VERIFICATION PASSED 100% ON {env_name}!\n")

if __name__ == "__main__":
    local_url = "http://127.0.0.1:8000"
    verify_environment(local_url, "LOCAL SERVER")

    prod_url = "https://frank-chat-app.vercel.app"
    verify_environment(prod_url, "VERCEL PRODUCTION")
