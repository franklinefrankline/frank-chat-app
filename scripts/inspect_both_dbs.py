import psycopg
import sqlite3

neon_url = 'postgresql://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
conn_neon = psycopg.connect(neon_url)
cur_neon = conn_neon.cursor()

cur_neon.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
neon_tables = [r[0] for r in cur_neon.fetchall()]

print("=== NEON PRODUCTION DB ===")
for t in sorted(neon_tables):
    cur_neon.execute(f'SELECT COUNT(*) FROM "{t}"')
    cnt = cur_neon.fetchone()[0]
    cur_neon.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{t}'")
    cols = [r[0] for r in cur_neon.fetchall()]
    print(f"Table '{t}': {cnt} rows, cols: {cols}")

print("\n=== LOCAL SQLITE (backend/chatapp.db) ===")
conn_lite = sqlite3.connect("backend/chatapp.db")
cur_lite = conn_lite.cursor()
cur_lite.execute("SELECT name FROM sqlite_master WHERE type='table'")
lite_tables = [r[0] for r in cur_lite.fetchall()]
for t in sorted(lite_tables):
    if not t.startswith("sqlite_"):
        cur_lite.execute(f'SELECT COUNT(*) FROM "{t}"')
        cnt = cur_lite.fetchone()[0]
        cur_lite.execute(f'PRAGMA table_info("{t}")')
        cols = [r[1] for r in cur_lite.fetchall()]
        print(f"Table '{t}': {cnt} rows, cols: {cols}")

conn_neon.close()
conn_lite.close()
