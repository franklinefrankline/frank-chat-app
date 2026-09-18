import json
import urllib.request

BASE_URL = "http://127.0.0.1:8000"

def test_login(identifier, password):
    url = f"{BASE_URL}/api/auth/login"
    payload = json.dumps({"username": identifier, "password": password}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"[PASS] Logged in as: {identifier}")
            print(f"       User ID: {data['user']['id']}")
            print(f"       Username: {data['user']['username']}")
            print(f"       Email: {data['user']['email']}")
            print(f"       Role: {data['user']['role']}")
            print(f"       Active: {data['user']['is_active']}")
            assert data['user']['role'] == 'admin', "User role should be admin"
            return True
    except Exception as e:
        print(f"[FAIL] Login failed for {identifier}: {e}")
        return False

if __name__ == "__main__":
    p1 = test_login("Frankline", "#Frankline2006")
    p2 = test_login("frankline30999112@gmail.com", "#Frankline2006")
    if p1 and p2:
        print("\nALL ADMIN CREDENTIAL TESTS PASSED! [SUCCESS]")
    else:
        exit(1)
