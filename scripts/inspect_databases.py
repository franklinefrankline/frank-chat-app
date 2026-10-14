import os
import sys
import ssl
import sqlite3
import pg8000.native

def inspect_local():
    print("=== LOCALHOST SQLITE DATABASE (backend/chatapp.db) ===")
    conn = sqlite3.connect("backend/chatapp.db")
    c = conn.cursor()
    c.execute("SELECT id, username, email, full_name, role, is_active FROM users")
    users = c.fetchall()
    print(f"Total Local Users: {len(users)}")
    admins = [u for u in users if u[4] == 'admin']
    print(f"Local Admin Users ({len(admins)}):")
    for a in admins:
        print(f"  ID: {a[0]}, Username: {a[1]}, Email: {a[2]}, Name: {a[3]}, Role: {a[4]}, Active: {a[5]}")
    non_admins = [u for u in users if u[4] != 'admin']
    print(f"Local Non-Admin Users: {len(non_admins)}")
    
    c.execute("SELECT COUNT(*) FROM conversations")
    print(f"Total Local Conversations: {c.fetchone()[0]}")
    c.execute("SELECT COUNT(*) FROM conversation_members")
    print(f"Total Local ConversationMembers: {c.fetchone()[0]}")
    c.execute("SELECT COUNT(*) FROM groups")
    print(f"Total Local Groups: {c.fetchone()[0]}")
    c.execute("SELECT COUNT(*) FROM group_members")
    print(f"Total Local GroupMembers: {c.fetchone()[0]}")
    c.execute("SELECT COUNT(*) FROM messages")
    print(f"Total Local Messages: {c.fetchone()[0]}")
    c.execute("SELECT COUNT(*) FROM documents")
    print(f"Total Local Documents: {c.fetchone()[0]}")
    conn.close()

def inspect_production():
    print("\n=== PRODUCTION NEON POSTGRESQL DATABASE ===")
    ssl_context = ssl.create_default_context()
    conn = pg8000.native.Connection(
        user="neondb_owner",
        password="npg_8kgYbEIv9cAj",
        host="ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech",
        port=5432,
        database="neondb",
        ssl_context=ssl_context
    )
    users = conn.run("SELECT id, username, email, full_name, role, is_active FROM users")
    print(f"Total Production Users: {len(users)}")
    admins = [u for u in users if u[4] == 'admin']
    print(f"Production Admin Users ({len(admins)}):")
    for a in admins:
        print(f"  ID: {a[0]}, Username: {a[1]}, Email: {a[2]}, Name: {a[3]}, Role: {a[4]}, Active: {a[5]}")
    non_admins = [u for u in users if u[4] != 'admin']
    print(f"Production Non-Admin Users: {len(non_admins)}")
    
    convs = conn.run("SELECT COUNT(*) FROM conversations")[0][0]
    print(f"Total Production Conversations: {convs}")
    conv_mems = conn.run("SELECT COUNT(*) FROM conversation_members")[0][0]
    print(f"Total Production ConversationMembers: {conv_mems}")
    groups = conn.run("SELECT COUNT(*) FROM groups")[0][0]
    print(f"Total Production Groups: {groups}")
    grp_mems = conn.run("SELECT COUNT(*) FROM group_members")[0][0]
    print(f"Total Production GroupMembers: {grp_mems}")
    msgs = conn.run("SELECT COUNT(*) FROM messages")[0][0]
    print(f"Total Production Messages: {msgs}")
    docs = conn.run("SELECT COUNT(*) FROM documents")[0][0]
    print(f"Total Production Documents: {docs}")
    conn.close()

if __name__ == "__main__":
    inspect_local()
    inspect_production()
