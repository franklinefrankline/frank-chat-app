import sqlite3
import json

conn = sqlite3.connect('backend/chatapp.db')
cur = conn.cursor()
cur.execute("SELECT id, username, email FROM users WHERE id IN (2, 3, 4) OR email IN ('alex@frank.app', 'sarah@frank.app', 'david@frank.app')")
demos = cur.fetchall()

cur.execute("SELECT id, username, email FROM users WHERE id IN (1, 23, 270, 274, 275, 276)")
manuals = cur.fetchall()

cur.execute("SELECT COUNT(*) FROM messages WHERE sender_id IN (1, 23, 270, 274, 275, 276)")
msg_count = cur.fetchone()[0]

res = {
    "demos": len(demos),
    "manuals": len(manuals),
    "manual_messages": msg_count,
    "manual_accounts": [{"id": m[0], "username": m[1], "email": m[2]} for m in manuals]
}
print(json.dumps(res))
conn.close()
