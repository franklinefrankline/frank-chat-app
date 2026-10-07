import urllib.request
import json
import ssl
import os
import sys

ctx = ssl.create_default_context()
base = 'https://frank-chat-app.onrender.com'
rand = 993311
email = f'live_render_{rand}@example.com'
pwd = 'RenderLivePass123!'

print('1. Registering user via live Render API...')
req = urllib.request.Request(
    f'{base}/api/auth/register',
    data=json.dumps({'full_name': 'Live Render User', 'email': email, 'password': pwd}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req, context=ctx) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    token = data['access_token']
    uid = data['user']['id']
    fid = data['user']['frank_id']
    print(f'[PASS] Registered User ID: {uid}, FRANK ID: {fid}')

print('\n2. Sending direct message to Alex (ID: 2)...')
msg_req = urllib.request.Request(
    f'{base}/api/messages',
    data=json.dumps({'recipient_id': 2, 'content': 'Hello Alex from live Neon-backed Render backend!'}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}
)
with urllib.request.urlopen(msg_req, context=ctx) as resp:
    msg_data = json.loads(resp.read().decode('utf-8'))
    print(f'[PASS] Message created! ID: {msg_data.get("id")}, content: "{msg_data.get("content")}"')

    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print('[SKIP DB direct check: DATABASE_URL not set in local environment]')
        sys.exit(0)
sys.path.insert(0, 'backend')
import database, models
db = database.SessionLocal()
u = db.query(models.User).filter(models.User.email == email).first()
print(f'[PASS] Verified User in Neon PostgreSQL: {u.email} (ID: {u.id}, FRANK ID: {u.frank_id})')
m = db.query(models.Message).filter(models.Message.sender_id == uid).first()
print(f'[PASS] Verified Message in Neon PostgreSQL: "{m.content}" (Msg ID: {m.id}, Recipient ID: {m.recipient_id})')
db.close()

print('\n============================================================')
print('100% PRODUCTION LIVE PERSISTENCE CONFIRMED IN NEON POSTGRESQL!')
print('============================================================')
