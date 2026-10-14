import sqlite3

conn = sqlite3.connect("backend/chatapp.db")
c = conn.cursor()

print("=== User 1 details ===")
c.execute("SELECT id, username, email, full_name, role, is_active FROM users WHERE id = 1")
print("User 1:", c.fetchone())

print("\n=== User 1 counts ===")
c.execute("SELECT COUNT(*) FROM documents WHERE uploader_id = 1")
print("User 1 documents:", c.fetchone()[0])

c.execute("SELECT COUNT(*) FROM messages WHERE sender_id = 1")
print("User 1 sent messages:", c.fetchone()[0])

c.execute("SELECT COUNT(*) FROM groups WHERE created_by = 1")
print("Groups created by User 1:", c.fetchone()[0])

c.execute("SELECT COUNT(*) FROM audit_logs WHERE admin_id = 1")
print("Audit logs for User 1:", c.fetchone()[0])

c.execute("SELECT COUNT(*) FROM users WHERE id != 1")
print("Users to be removed (id != 1):", c.fetchone()[0])

conn.close()
