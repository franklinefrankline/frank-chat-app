import os
import ssl
import json
import sqlite3
import shutil
from datetime import datetime
from sqlalchemy import create_engine, text

def make_backup():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"backups/{timestamp}"
    os.makedirs(backup_dir, exist_ok=True)
    print(f"Creating backup in {backup_dir}...")

    # 1. Back up local SQLite databases
    for db_path in ["backend/chatapp.db", "chatapp.db"]:
        if os.path.exists(db_path):
            dst = os.path.join(backup_dir, os.path.basename(db_path))
            shutil.copy2(db_path, dst)
            print(f"Backed up local SQLite: {db_path} -> {dst}")

    # 2. Connect to production Neon PostgreSQL
    neon_url = 'postgresql+pg8000://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb'
    engine = create_engine(neon_url, connect_args={'ssl_context': ssl.create_default_context()})

    neon_backup = {}
    with engine.connect() as conn:
        tables = [r[0] for r in conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).fetchall()]
        print(f"Public tables in Neon DB ({len(tables)} tables):", sorted(tables))

        for t in sorted(tables):
            try:
                rows = conn.execute(text(f'SELECT * FROM "{t}"')).mappings().all()
                neon_backup[t] = [dict(r) for r in rows]
                # Convert non-serializable objects (datetime, etc) to string
                for r in neon_backup[t]:
                    for k, v in r.items():
                        if isinstance(v, (datetime, bytes)):
                            r[k] = str(v)
                print(f"  Exported Neon table '{t}': {len(neon_backup[t])} rows")
            except Exception as e:
                print(f"  Error reading Neon table '{t}': {e}")

    # Save Neon dump JSON
    neon_dump_path = os.path.join(backup_dir, "neon_prod_backup.json")
    with open(neon_dump_path, "w", encoding="utf-8") as f:
        json.dump(neon_backup, f, indent=2, default=str)
    print(f"Successfully saved Neon PostgreSQL backup to {neon_dump_path}")

    # 3. Check Local SQLite Counts
    local_counts = {}
    if os.path.exists("backend/chatapp.db"):
        conn = sqlite3.connect("backend/chatapp.db")
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        sqlite_tables = [r[0] for r in cur.fetchall()]
        print(f"\nLocal SQLite (backend/chatapp.db) tables:")
        for t in sorted(sqlite_tables):
            if not t.startswith("sqlite_"):
                cur.execute(f"SELECT COUNT(*) FROM \"{t}\"")
                cnt = cur.fetchone()[0]
                local_counts[t] = cnt
                print(f"  {t}: {cnt} rows")
        conn.close()

    print("\nBackup complete! All data secured.")
    return backup_dir, neon_backup, local_counts

if __name__ == "__main__":
    make_backup()
