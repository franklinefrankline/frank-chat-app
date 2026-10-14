import sqlite3

conn = sqlite3.connect('backend/chatapp.db')
cur = conn.cursor()
cur.execute('SELECT id, sender_id, recipient_id, group_id, message_type, file_id, content FROM messages WHERE content LIKE "%Shared%" OR content LIKE "%.xlsx%" OR content LIKE "%.docx%" OR content LIKE "%.pdf%" LIMIT 20')
for row in cur.fetchall():
    print("MSG:", row[0], "file_id:", row[5], "type:", row[4], "content:", repr(row[6][:50]))
