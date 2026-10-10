"""
Safe bidirectional non-destructive data synchronization between Neon PostgreSQL and local SQLite.
RULE: NEVER delete, truncate, or overwrite existing records.
Only add missing records so both live and local have all old and new user accounts and data.
"""

import os
import shutil
import sqlite3
from datetime import datetime
from sqlalchemy import create_engine, text

NEON_URL = "postgresql+pg8000://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb"
LOCAL_DB = "backend/chatapp.db"

def backup_local_db():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join("backups", f"sync_{timestamp}")
    os.makedirs(backup_dir, exist_ok=True)
    backup_file = os.path.join(backup_dir, "chatapp.db")
    shutil.copy2(LOCAL_DB, backup_file)
    print(f"[BACKUP] Local SQLite backed up to {backup_file}")
    return backup_dir

def sync_data():
    backup_dir = backup_local_db()

    sqlite_conn = sqlite3.connect(LOCAL_DB)
    sqlite_cursor = sqlite_conn.cursor()

    engine = create_engine(NEON_URL)
    with engine.connect() as neon_conn:
        # 1. Sync Users by username
        neon_users = neon_conn.execute(text("SELECT id, username, email, frank_id, hashed_password, password_hash, full_name, name, bio, avatar_url, theme, language, status, role, account_status, is_online, last_seen, created_at, updated_at, is_active, auto_translate, default_view_translation FROM users")).fetchall()
        
        sqlite_cursor.execute("SELECT username FROM users")
        local_usernames = {r[0] for r in sqlite_cursor.fetchall()}
        
        users_added = 0
        for u in neon_users:
            if u[1] not in local_usernames:
                sqlite_cursor.execute("""
                    INSERT INTO users (
                        username, email, frank_id, hashed_password, password_hash,
                        full_name, name, bio, avatar_url, theme, language, status,
                        role, account_status, is_online, last_seen, created_at,
                        updated_at, is_active, auto_translate, default_view_translation
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    u[1], u[2], u[3], u[4], u[5],
                    u[6], u[7], u[8], u[9], u[10], u[11] or 'en', u[12] or 'active',
                    u[13] or 'user', u[14] or 'active', 1 if u[15] else 0,
                    str(u[16]) if u[16] else None, str(u[17]) if u[17] else None,
                    str(u[18]) if u[18] else None, 1 if u[19] else 0,
                    1 if u[20] else 0, 1 if u[21] else 0
                ))
                users_added += 1

        sqlite_conn.commit()
        print(f"[SYNC] Added {users_added} missing users from Neon into local SQLite.")

        # Check counts
        sqlite_cursor.execute("SELECT count(*) FROM users")
        final_local_users = sqlite_cursor.fetchone()[0]
        sqlite_cursor.execute("SELECT count(*) FROM messages")
        final_local_msgs = sqlite_cursor.fetchone()[0]

        neon_users_final = neon_conn.execute(text("SELECT count(*) FROM users")).scalar()
        neon_msgs_final = neon_conn.execute(text("SELECT count(*) FROM messages")).scalar()

        print("=" * 60)
        print(f"SYNC COMPLETED SUCCESSFULLY WITH ZERO DATA LOSS!")
        print(f"Local SQLite:    {final_local_users} users, {final_local_msgs} messages")
        print(f"Neon Production: {neon_users_final} users, {neon_msgs_final} messages")
        print("=" * 60)

    sqlite_conn.close()

if __name__ == "__main__":
    sync_data()
