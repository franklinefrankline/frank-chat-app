"""
Database Backup & Verification Script for FRANK Think
Safely dumps and verifies local SQLite and remote Neon PostgreSQL databases.
"""

import os
import sys
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import pg8000.native

root_dir = Path(__file__).resolve().parent.parent
backups_dir = root_dir / "backups"
backups_dir.mkdir(parents=True, exist_ok=True)

now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

def backup_local():
    print("--- 1. BACKING UP LOCAL DATABASE & UPLOADS ---")
    local_db = root_dir / "backend" / "chatapp.db"
    if not local_db.exists():
        print("ERROR: Local database file not found:", local_db)
        return False

    backup_db_path = backups_dir / f"local_chatapp_backup_{now_str}.db"
    shutil.copy2(local_db, backup_db_path)
    print(f"Local database copied to: {backup_db_path} ({backup_db_path.stat().st_size} bytes)")

    # Verify SQLite backup
    conn = sqlite3.connect(backup_db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r[0] for r in cur.fetchall() if not r[0].startswith("sqlite_")]
    print(f"Verified {len(tables)} tables in local SQLite backup:")
    for t in sorted(tables):
        cur.execute(f"SELECT COUNT(*) FROM \"{t}\"")
        cnt = cur.fetchone()[0]
        print(f"  - {t}: {cnt} rows")
    conn.close()

    # Backup local uploads
    local_uploads = root_dir / "backend" / "uploads"
    if local_uploads.exists():
        backup_uploads = backups_dir / f"local_uploads_backup_{now_str}"
        shutil.copytree(local_uploads, backup_uploads, dirs_exist_ok=True)
        file_count = sum(1 for _ in backup_uploads.rglob("*") if _.is_file())
        print(f"Local uploads backed up: {file_count} files in {backup_uploads}")
    return True

def backup_production():
    print("\n--- 2. BACKING UP PRODUCTION NEON POSTGRESQL ---")
    neon_host = "ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech"
    neon_user = "neondb_owner"
    neon_db = "neondb"
    neon_pass = "npg_8kgYbEIv9cAj"

    try:
        conn = pg8000.native.Connection(
            user=neon_user,
            host=neon_host,
            database=neon_db,
            password=neon_pass,
            ssl_context=True
        )
        print("Connected to Neon PostgreSQL successfully.")

        tables_query = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
        tables = [r[0] for r in conn.run(tables_query)]
        print(f"Found {len(tables)} production tables in Neon:")

        prod_dump = {
            "backup_timestamp": now_str,
            "host": neon_host,
            "database": neon_db,
            "tables": {}
        }

        for t in tables:
            rows = conn.run(f"SELECT * FROM \"{t}\";")
            count = len(rows)
            print(f"  - {t}: {count} rows")
            # Format row data safely
            serialized_rows = []
            for row in rows:
                row_serialized = []
                for val in row:
                    if isinstance(val, (datetime, )):
                        row_serialized.append(val.isoformat())
                    elif isinstance(val, bytes):
                        row_serialized.append(val.hex())
                    else:
                        row_serialized.append(val)
                serialized_rows.append(row_serialized)
            prod_dump["tables"][t] = {
                "count": count,
                "rows": serialized_rows
            }

        conn.close()

        prod_backup_file = backups_dir / f"production_neon_backup_{now_str}.json"
        with open(prod_backup_file, "w", encoding="utf-8") as f:
            json.dump(prod_dump, f, indent=2)

        print(f"Production backup saved: {prod_backup_file} ({prod_backup_file.stat().st_size} bytes)")
        return True
    except Exception as e:
        print("ERROR backing up production database:", e)
        return False

if __name__ == "__main__":
    b1 = backup_local()
    b2 = backup_production()
    if b1 and b2:
        print("\nSUCCESS: All local and production backups created and verified safely!")
        sys.exit(0)
    else:
        print("\nFAILURE: Backup verification failed!")
        sys.exit(1)
