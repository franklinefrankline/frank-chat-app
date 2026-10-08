import urllib.request
import json
import time
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

TAMIL_STORY = """முயற்சியின் வெற்றி

ஒரு சிறிய கிராமத்தில் குமார் என்ற இளைஞன் வாழ்ந்து வந்தான். அவன் ஒரு சிறிய விவசாய நிலத்தை வைத்திருந்தான். அந்த ஆண்டு மழை சரியாக பெய்யாததால், கிராமத்தில் தண்ணீர் பற்றாக்குறை ஏற்பட்டது. பயிர்கள் வாடத் தொடங்கின.

குமார் கவலைப்படாமல், மழை பெய்யும் போது தண்ணீரை சேமிக்க ஒரு மழைநீர் சேகரிப்பு அமைப்பையும் சிறிய நீர்த்தேக்கத்தையும் தனது நிலத்தில் அமைத்தான். ஆரம்பத்தில் சில கிராம மக்கள் அவனைப் பார்த்து, “இதனால் என்ன பயன்?” என்று கேலி செய்தனர்.

சில நாட்களுக்குப் பிறகு நல்ல மழை பெய்தது. குமார் சேமித்த மழைநீரை பயன்படுத்தி தனது பயிர்களுக்கு தொடர்ந்து தண்ணீர் கொடுத்தான். அவனது பயிர்கள் நன்றாக வளர்ந்து, நல்ல விளைச்சல் கிடைத்தது.

குமாரின் வெற்றியைப் பார்த்த கிராம மக்கள் அவனிடம் மழைநீரை எவ்வாறு சேமிப்பது என்று கற்றுக்கொண்டனர். பின்னர் அனைவரும் ஒன்றிணைந்து ஒரு பெரிய மழைநீர் சேகரிப்பு திட்டத்தை உருவாக்கினர். இதனால் கிராமத்தின் தண்ணீர் பற்றாக்குறை குறைந்தது.

நீதி:

முயற்சி, ஒற்றுமை மற்றும் சரியான திட்டமிடல் இருந்தால் பெரிய பிரச்சினைகளையும் தீர்க்க முடியும்."""

def test_tamil_on_target(base_url, target_name):
    print(f"\n=======================================================")
    print(f"TESTING SMART CONVERSATIONS TAMIL: {target_name} ({base_url})")
    print(f"=======================================================")

    ts = int(time.time())
    headers = {"Content-Type": "application/json"}

    # 1. Register User A
    user_a_payload = json.dumps({
        "username": f"tamil_user_{ts}",
        "email": f"tamil_user_{ts}@test.app",
        "password": "Pass#Tamil2026",
        "full_name": "Kumar Tamil"
    }).encode('utf-8')

    req = urllib.request.Request(f"{base_url}/api/auth/register", data=user_a_payload, headers=headers)
    with urllib.request.urlopen(req) as r:
        u_data = json.loads(r.read().decode('utf-8'))
        token_a = u_data["access_token"]
        user_a = u_data["user"]
        print(f"  [PASS] Registered User A: {user_a['username']} ({user_a['frank_id']})")

    # 2. Register User B
    user_b_payload = json.dumps({
        "username": f"tamil_part_{ts}",
        "email": f"tamil_part_{ts}@test.app",
        "password": "Pass#Tamil2026",
        "full_name": "Villager"
    }).encode('utf-8')

    req = urllib.request.Request(f"{base_url}/api/auth/register", data=user_b_payload, headers=headers)
    with urllib.request.urlopen(req) as r:
        u_data_b = json.loads(r.read().decode('utf-8'))
        user_b = u_data_b["user"]
        print(f"  [PASS] Registered User B: {user_b['username']} ({user_b['frank_id']})")

    # 3. Create Private Conversation
    auth_h = {"Authorization": f"Bearer {token_a}", "Content-Type": "application/json"}
    c_req = urllib.request.Request(f"{base_url}/api/users/conversations/private", data=json.dumps({"target_user_id": user_b["id"]}).encode('utf-8'), headers=auth_h)
    with urllib.request.urlopen(c_req) as cr:
        conv = json.loads(cr.read().decode('utf-8'))
        conv_id = conv["id"]
        print(f"  [PASS] Private Conversation created: ID {conv_id}")

    # 4. Send Tamil Story Message
    m_req = urllib.request.Request(f"{base_url}/api/messages", data=json.dumps({"recipient_id": user_b["id"], "content": TAMIL_STORY}).encode('utf-8'), headers=auth_h)
    with urllib.request.urlopen(m_req) as mr:
        msg = json.loads(mr.read().decode('utf-8'))
        msg_id = msg["id"]
        print(f"  [PASS] Tamil Story Message sent: ID {msg_id}")

    # 5. Run Message-Specific Smart Analysis (Scope: MESSAGE)
    analyze_payload = json.dumps({
        "conversation_type": "direct",
        "scope": "MESSAGE",
        "message_id": msg_id,
        "force_refresh": True
    }).encode('utf-8')
    req = urllib.request.Request(f"{base_url}/api/conversations/{conv_id}/smart-analysis?message_id={msg_id}", data=analyze_payload, headers=auth_h)
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read().decode('utf-8'))
        print(f"  [PASS] Smart Analysis Mode: {res.get('mode')}, Status: {res.get('status')}")
        print(f"  Response Keys: {list(res.keys())}")
        data = res.get("data") if "data" in res else res

        # Validate all 8 tabs mapped from API keys
        tab_mapping = {
            "summary": "summary",
            "missed": "what_did_i_miss",
            "important": "important_messages",
            "actions": "action_items",
            "decisions": "decisions",
            "dates": "dates",
            "files": "important_files",
            "insights": "insights"
        }
        for tab_name, api_key in tab_mapping.items():
            assert api_key in data, f"Missing API field '{api_key}' for tab '{tab_name}'"
            val = data[api_key]
            print(f"    Tab [{tab_name.upper()}] (field: {api_key}): present, type={type(val).__name__}")

        # Check Summary
        summary = data["summary"]
        print(f"    Summary content: {summary}")

        # Strict Context Isolation: Must NOT contain foreign topics (e.g. backend testing, postgresql)
        full_json = json.dumps(data, ensure_ascii=False).lower()
        unrelated_terms = ["backend testing", "rainwater harvesting in postgres", "api routes", "docker-compose"]
        for term in unrelated_terms:
            assert term not in full_json, f"Contamination detected! Term '{term}' found in Tamil story analysis"
        print(f"  [PASS] Strict Context Isolation verified (No unrelated terms in Tamil analysis)")

        # Verify Tamil content preservation
        tamil_keywords = ["குமார்", "மழை", "விவசாய", "வெற்றி", "நீதி"]
        found_keywords = [kw for kw in tamil_keywords if kw in full_json]
        print(f"  [PASS] Tamil Unicode Keywords Identified: {found_keywords}")
        assert len(found_keywords) > 0, "Tamil content lost in analysis"

    print(f"✅ ALL TAMIL SMART CONVERSATIONS TESTS PASSED ON {target_name}!\n")

if __name__ == "__main__":
    local_url = "http://127.0.0.1:8000"
    test_tamil_on_target(local_url, "LOCAL SERVER")

    # Also test live on Vercel production
    prod_url = "https://frank-chat-app.vercel.app"
    test_tamil_on_target(prod_url, "VERCEL PRODUCTION")
