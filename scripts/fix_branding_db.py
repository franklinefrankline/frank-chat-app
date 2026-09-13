import sqlite3
import sys
from pathlib import Path

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

db_path = Path(__file__).resolve().parent.parent / "backend" / "chatapp.db"
conn = sqlite3.connect(str(db_path))
cur = conn.cursor()

# Check tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]

if "users" in tables:
    cur.execute("UPDATE users SET bio = REPLACE(bio, 'ChatApp', 'QENVO') WHERE bio LIKE '%ChatApp%'")
    cur.execute("UPDATE users SET bio = 'Hey there! I am using QENVO.' WHERE bio IS NULL OR bio = '' OR bio = 'Hey there! I am using ChatApp.'")
    conn.commit()
    
    cur.execute("SELECT id, username, bio FROM users")
    for u in cur.fetchall():
        print(f"User {u[0]}: @{u[1]} -> {u[2]}")

if "messages" in tables:
    cur.execute("UPDATE messages SET content = REPLACE(content, 'ChatApp', 'QENVO') WHERE content LIKE '%ChatApp%'")
    conn.commit()
    print("Messages updated if any contained ChatApp")

conn.close()
print("Database branding cleanup completed successfully.")
