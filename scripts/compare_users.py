import psycopg
import sqlite3

neon_url = 'postgresql://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
conn_neon = psycopg.connect(neon_url)
cur_neon = conn_neon.cursor()

cur_neon.execute("SELECT id, username, email, frank_id FROM users ORDER BY id")
neon_users = cur_neon.fetchall()
print(f"Neon Users ({len(neon_users)}):")
for u in neon_users:
    print(f"  ID={u[0]}, user={u[1]}, email={u[2]}, frank_id={u[3]}")

conn_lite = sqlite3.connect("backend/chatapp.db")
cur_lite = conn_lite.cursor()
cur_lite.execute("SELECT id, username, email, frank_id FROM users WHERE id <= 25 ORDER BY id")
lite_users = cur_lite.fetchall()
print(f"\nSQLite Users 1..25 ({len(lite_users)}):")
for u in lite_users:
    print(f"  ID={u[0]}, user={u[1]}, email={u[2]}, frank_id={u[3]}")

conn_neon.close()
conn_lite.close()
