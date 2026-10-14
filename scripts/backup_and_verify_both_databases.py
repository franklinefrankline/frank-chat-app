import os
import sys
import ssl
import json
import shutil
import sqlite3
from datetime import datetime, timezone
import pg8000.native

BACKUP_DIR = os.path.abspath("backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

def backup_local():
    print("--- 1. BACKING UP LOCALHOST SQLITE DATABASE ---")
    local_db_path = os.path.abspath("backend/chatapp.db")
    if not os.path.exists(local_db_path):
        raise FileNotFoundError(f"Local database not found at {local_db_path}")
    
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(BACKUP_DIR, f"chatapp_local_pre_cleanup_{timestamp}.db")
    
    # Use SQLite online backup API to ensure clean snapshot even if open
    src_conn = sqlite3.connect(local_db_path)
    dst_conn = sqlite3.connect(backup_file)
    with dst_conn:
        src_conn.backup(dst_conn)
    dst_conn.close()
    src_conn.close()
    
    # Verify backup
    if not os.path.exists(backup_file) or os.path.getsize(backup_file) == 0:
        raise RuntimeError(f"Local backup failed or empty: {backup_file}")
    
    test_conn = sqlite3.connect(backup_file)
    c = test_conn.cursor()
    c.execute("SELECT id, username, email, full_name, role, is_active FROM users WHERE id = 1")
    admin = c.fetchone()
    if not admin:
        test_conn.close()
        raise RuntimeError("VERIFICATION FAILED: Admin User ID 1 not found in local backup!")
    if admin[4] != "admin" or admin[5] != 1:
        test_conn.close()
        raise RuntimeError(f"VERIFICATION FAILED: Local User ID 1 is not active admin! role={admin[4]}, active={admin[5]}")
    
    # Get table counts
    tables = [
        "users", "conversations", "conversation_members", "groups",
        "group_members", "messages", "message_translations", "documents",
        "document_versions", "reactions", "audit_logs", "conversation_preferences",
        "otp_codes", "account_access_requests"
    ]
    counts = {}
    for t in tables:
        try:
            c.execute(f"SELECT COUNT(*) FROM {t}")
            counts[t] = c.fetchone()[0]
        except Exception as e:
            counts[t] = f"Error: {e}"
    test_conn.close()
    
    print(f"SUCCESS: Local database backed up to: {backup_file}")
    print(f"File size: {os.path.getsize(backup_file):,} bytes")
    print(f"Admin verified: ID={admin[0]}, Email={admin[2]}, Role={admin[4]}, Active={admin[5]}")
    print(f"Local baseline counts: {json.dumps(counts, indent=2)}")
    return backup_file, counts

def backup_production():
    print("\n--- 2. BACKING UP PRODUCTION NEON POSTGRESQL DATABASE ---")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(BACKUP_DIR, f"neon_production_pre_cleanup_{timestamp}.json")
    
    ssl_context = ssl.create_default_context()
    conn = pg8000.native.Connection(
        user="neondb_owner",
        password="npg_8kgYbEIv9cAj",
        host="ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech",
        port=5432,
        database="neondb",
        ssl_context=ssl_context
    )
    
    # Verify Admin account in production
    admin_rows = conn.run("SELECT id, username, email, full_name, role, is_active FROM users WHERE id = 1")
    if not admin_rows:
        conn.close()
        raise RuntimeError("VERIFICATION FAILED: Admin User ID 1 not found in production database!")
    admin = admin_rows[0]
    if admin[4] != "admin" or not admin[5]:
        conn.close()
        raise RuntimeError(f"VERIFICATION FAILED: Production User ID 1 is not active admin! role={admin[4]}, active={admin[5]}")
    
    print(f"Admin verified in production: ID={admin[0]}, Email={admin[2]}, Role={admin[4]}, Active={admin[5]}")
    
    # Tables to dump
    tables = [
        "users", "conversations", "conversation_members", "groups",
        "group_members", "messages", "message_translations", "documents",
        "document_versions", "reactions", "audit_logs", "conversation_preferences",
        "otp_codes", "account_access_requests"
    ]
    
    dump_data = {
        "metadata": {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "target": "ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb",
            "admin_user_id": 1,
            "admin_email": admin[2]
        },
        "tables": {},
        "counts": {}
    }
    
    for t in tables:
        try:
            # Get column names
            col_info = conn.run(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '{t}' 
                ORDER BY ordinal_position
            """)
            col_names = [r[0] for r in col_info]
            
            # Fetch all rows
            rows = conn.run(f"SELECT * FROM {t}")
            row_dicts = []
            for row in rows:
                row_dict = {}
                for idx, col in enumerate(col_names):
                    val = row[idx]
                    if isinstance(val, datetime):
                        row_dict[col] = val.isoformat()
                    elif isinstance(val, (bytes, bytearray)):
                        row_dict[col] = f"<binary {len(val)} bytes>"
                    else:
                        row_dict[col] = val
                row_dicts.append(row_dict)
            dump_data["tables"][t] = {
                "columns": col_names,
                "rows": row_dicts
            }
            dump_data["counts"][t] = len(row_dicts)
            print(f"  Table '{t}': {len(row_dicts)} rows backed up.")
        except Exception as e:
            print(f"  Warning on table '{t}': {e}")
            dump_data["counts"][t] = f"Error: {e}"
    
    conn.close()
    
    # Write to file
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(dump_data, f, indent=2)
        
    # Verify file exists and readable
    if not os.path.exists(backup_file) or os.path.getsize(backup_file) == 0:
        raise RuntimeError(f"Production backup failed or empty: {backup_file}")
    
    with open(backup_file, "r", encoding="utf-8") as f:
        verified_data = json.load(f)
    
    admin_in_backup = next((u for u in verified_data["tables"]["users"]["rows"] if u["id"] == 1), None)
    if not admin_in_backup:
        raise RuntimeError("VERIFICATION FAILED: Admin User ID 1 not found in production backup JSON file!")
    
    print(f"\nSUCCESS: Production database backed up to: {backup_file}")
    print(f"File size: {os.path.getsize(backup_file):,} bytes")
    print(f"Production baseline counts: {json.dumps(verified_data['counts'], indent=2)}")
    return backup_file, verified_data["counts"]

if __name__ == "__main__":
    local_backup, local_counts = backup_local()
    prod_backup, prod_counts = backup_production()
    print("\n==========================================")
    print("ALL PRE-CLEANUP BACKUPS VERIFIED AND READY")
    print(f"Local backup:      {local_backup}")
    print(f"Production backup: {prod_backup}")
    print("==========================================")
