import sqlite3
import sys

def cleanup_local():
    print("=== STARTING LOCAL DATABASE CLEANUP (backend/chatapp.db) ===")
    conn = sqlite3.connect("backend/chatapp.db")
    conn.execute("PRAGMA foreign_keys = ON;")
    c = conn.cursor()
    
    try:
        # 1. Verify User 1 exists and is admin
        c.execute("SELECT id, username, email, full_name, role, is_active FROM users WHERE id = 1")
        admin = c.fetchone()
        if not admin:
            raise RuntimeError("CRITICAL ERROR: Administrator ID 1 not found in local database!")
        print(f"Verified Administrator: ID={admin[0]}, Email={admin[2]}, Name={admin[3]}, Role={admin[4]}")
        
        c.execute("SELECT COUNT(*) FROM users WHERE id != 1")
        non_admin_count = c.fetchone()[0]
        print(f"Non-admin accounts to be removed: {non_admin_count}")
        
        # Start transaction
        conn.execute("BEGIN TRANSACTION;")
        
        # 2. Clean smart data & preferences referencing messages/users first
        c.execute("DELETE FROM smart_action_items")
        print(f"Cleaned {c.rowcount} smart action items.")
        c.execute("DELETE FROM smart_decisions")
        print(f"Cleaned {c.rowcount} smart decisions.")
        c.execute("DELETE FROM smart_dates")
        print(f"Cleaned {c.rowcount} smart dates.")
        c.execute("DELETE FROM conversation_summaries")
        print(f"Cleaned {c.rowcount} conversation summaries.")
        c.execute("DELETE FROM conversation_preferences WHERE user_id != 1")
        print(f"Cleaned {c.rowcount} non-admin conversation preferences.")
        
        # 3. Clean message reactions and translations
        c.execute("DELETE FROM reactions")
        print(f"Cleaned {c.rowcount} reactions.")
        c.execute("DELETE FROM message_translations")
        print(f"Cleaned {c.rowcount} message translations.")
        
        # 4. Unlink documents and messages
        c.execute("UPDATE documents SET message_id = NULL, conversation_id = NULL, group_id = NULL")
        print("Unlinked documents from messages, conversations, and groups.")
        c.execute("UPDATE messages SET file_id = NULL, reply_to_id = NULL")
        print("Unlinked messages reply_to_id and file_id.")
        
        # 5. Clean messages
        c.execute("DELETE FROM messages")
        print(f"Cleaned {c.rowcount} messages.")
        
        # 6. Clean document versions and non-admin documents
        c.execute("DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE uploader_id != 1) OR created_by_id != 1")
        print(f"Removed {c.rowcount} non-admin document versions.")
        c.execute("DELETE FROM documents WHERE uploader_id != 1")
        print(f"Removed {c.rowcount} non-admin documents.")
        
        # 7. Clean group members and groups
        c.execute("DELETE FROM group_members")
        print(f"Cleaned {c.rowcount} group members.")
        c.execute("DELETE FROM groups")
        print(f"Cleaned {c.rowcount} groups.")
        
        # 8. Clean conversation members and conversations
        c.execute("DELETE FROM conversation_members")
        print(f"Cleaned {c.rowcount} conversation members.")
        c.execute("DELETE FROM conversations")
        print(f"Cleaned {c.rowcount} conversations.")
        
        # 9. Clean audit logs not belonging to admin 1
        c.execute("DELETE FROM audit_logs WHERE admin_id != 1")
        print(f"Cleaned {c.rowcount} non-admin audit logs.")
        
        # 10. Clean OTP codes and access requests for non-admins
        c.execute("DELETE FROM otp_codes WHERE email != ?", (admin[2],))
        print(f"Cleaned {c.rowcount} non-admin OTP codes.")
        c.execute("DELETE FROM account_access_requests WHERE email != ?", (admin[2],))
        print(f"Cleaned {c.rowcount} non-admin account access requests.")
        
        # 11. Delete all non-admin users
        c.execute("DELETE FROM users WHERE id != 1")
        deleted_users_count = c.rowcount
        print(f"Removed {deleted_users_count} user accounts.")
        
        # 12. Ensure User 1 is active administrator
        c.execute("""
            UPDATE users 
            SET role = 'admin', is_active = 1, account_status = 'active', status = 'active' 
            WHERE id = 1
        """)
        
        # 13. Check foreign key constraints
        c.execute("PRAGMA foreign_key_check;")
        fk_errors = c.fetchall()
        if fk_errors:
            raise RuntimeError(f"Foreign key violations detected: {fk_errors}")
        print("Foreign key integrity check passed with 0 errors.")
        
        # Verify counts
        c.execute("SELECT COUNT(*) FROM users")
        total_users = c.fetchone()[0]
        if total_users != 1:
            raise RuntimeError(f"Expected exactly 1 user remaining, found {total_users}!")
        
        c.execute("SELECT id, username, email, role, is_active FROM users")
        remaining_user = c.fetchone()
        print(f"Remaining user verified: {remaining_user}")
        
        # Check preserved documents
        c.execute("SELECT id, original_filename, uploader_id FROM documents")
        remaining_docs = c.fetchall()
        print(f"Preserved administrator documents count: {len(remaining_docs)}")
        for doc in remaining_docs:
            print(f"  Doc ID {doc[0]}: {doc[1]} (uploader={doc[2]})")
        
        # Commit transaction
        conn.commit()
        print("=== LOCAL TRANSACTION COMMITTED SUCCESSFULLY ===")
        
    except Exception as e:
        conn.rollback()
        print(f"CRITICAL: Transaction rolled back due to error: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    cleanup_local()
