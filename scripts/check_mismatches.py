import sqlite3

conn = sqlite3.connect('backend/chatapp.db')
cur = conn.cursor()
cur.execute('''
SELECT m.id, m.sender_id, m.recipient_id, m.group_id, m.file_id, m.content
FROM messages m
''')
msgs = cur.fetchall()
cur.execute('SELECT id, message_id, original_filename, stored_filename, file_type FROM documents')
docs = {d[0]: d for d in cur.fetchall()}
print('Total messages:', len(msgs))
print('Total documents:', len(docs))

for m in msgs:
    mid, s_id, r_id, g_id, fid, content = m
    if fid:
        if fid not in docs:
            print(f'MISMATCH: Message {mid} has file_id={fid} but doc does not exist!')
        else:
            doc = docs[fid]
            doc_mid = doc[1]
            if doc_mid != mid:
                print(f'NOTE: Message {mid} points to doc {fid}, but doc {fid}.message_id = {doc_mid}')

for did, doc in docs.items():
    doc_mid = doc[1]
    if doc_mid:
        cur.execute('SELECT id, file_id FROM messages WHERE id = ?', (doc_mid,))
        row = cur.fetchone()
        if not row:
            print(f'MISMATCH: Doc {did} has message_id={doc_mid} which does not exist in messages!')
        elif row[1] != did:
            print(f'MISMATCH: Doc {did} points to message {doc_mid}, but message {doc_mid}.file_id = {row[1]}!')
