import sqlite3
import sys

def inspect_db():
    conn = sqlite3.connect("backend/chatapp.db")
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall() if not r[0].startswith("sqlite_")]
    print("SQLite tables:", tables)

    for t in tables:
        cur.execute(f"PRAGMA foreign_key_list({t})")
        fks = cur.fetchall()
        user_fks = [fk for fk in fks if fk[2] == "users"]
        if user_fks:
            print(f"Table {t} references users: {user_fks}")

    # Let's count rows in each table for users 2, 3, 4
    demo_ids = [2, 3, 4]
    print("\n--- Rows directly referencing demo users 2, 3, 4 ---")
    for t in ["messages", "conversations", "group_members", "attachments", "pinned_messages", "reactions"]:
        if t in tables:
            try:
                # check column names
                cur.execute(f"PRAGMA table_info({t})")
                cols = [c[1] for c in cur.fetchall()]
                conditions = []
                for c in cols:
                    if "user" in c or c in ["sender_id", "recipient_id"]:
                        conditions.append(f"{c} IN (2, 3, 4)")
                if conditions:
                    query = f"SELECT COUNT(*) FROM {t} WHERE " + " OR ".join(conditions)
                    cur.execute(query)
                    cnt = cur.fetchone()[0]
                    print(f"  {t}: {cnt} rows matching demo_ids")
            except Exception as e:
                print(f"  {t} check error: {e}")

    conn.close()

if __name__ == "__main__":
    inspect_db()
