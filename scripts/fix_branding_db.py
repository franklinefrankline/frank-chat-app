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
    cur.execute("UPDATE users SET bio = REPLACE(REPLACE(bio, 'ChatApp', 'FRANK'), 'QENVO', 'FRANK') WHERE bio LIKE '%ChatApp%' OR bio LIKE '%QENVO%'")
    cur.execute("UPDATE users SET bio = 'Hey there! I am using FRANK.' WHERE bio IS NULL OR bio = '' OR bio = 'Hey there! I am using ChatApp.' OR bio = 'Hey there! I am using QENVO.'")
    conn.commit()
    
    cur.execute("SELECT id, username, bio FROM users")
    for u in cur.fetchall():
        print(f"User {u[0]}: @{u[1]} -> {u[2]}")

if "messages" in tables:
    cur.execute("UPDATE messages SET content = REPLACE(REPLACE(content, 'ChatApp', 'FRANK'), 'QENVO', 'FRANK') WHERE content LIKE '%ChatApp%' OR content LIKE '%QENVO%'")
    conn.commit()
    print("Messages updated if any contained ChatApp or QENVO")

conn.close()
print("Database branding cleanup completed successfully.")
