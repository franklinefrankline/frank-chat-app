import sqlite3

conn = sqlite3.connect("backend/chatapp.db")
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in c.fetchall()]

print("=== Tables referencing messages ===")
for t in tables:
    c.execute(f"PRAGMA foreign_key_list({t})")
    for fk in c.fetchall():
        if fk[2] == "messages":
            print(f"Table '{t}' column '{fk[3]}' references messages('{fk[4]}')")

print("\n=== Tables referencing documents ===")
for t in tables:
    c.execute(f"PRAGMA foreign_key_list({t})")
    for fk in c.fetchall():
        if fk[2] == "documents":
            print(f"Table '{t}' column '{fk[3]}' references documents('{fk[4]}')")

print("\n=== Tables referencing users ===")
for t in tables:
    c.execute(f"PRAGMA foreign_key_list({t})")
    for fk in c.fetchall():
        if fk[2] == "users":
            print(f"Table '{t}' column '{fk[3]}' references users('{fk[4]}')")

conn.close()
