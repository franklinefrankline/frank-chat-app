import os
import sys
import ssl
import json
import pg8000.native

def cleanup_production():
    print("=== STARTING PRODUCTION DATABASE CLEANUP (Neon PostgreSQL) ===")
    
    # 1. Connect to production database
    ssl_context = ssl.create_default_context()
    conn = pg8000.native.Connection(
        user="neondb_owner",
        password="npg_8kgYbEIv9cAj",
        host="ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech",
        port=5432,
        database="neondb",
        ssl_context=ssl_context
    )
    
    try:
        # 2. Verify connection target
        db_name = conn.run("SELECT current_database()")[0][0]
        host = "ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech"
        print(f"Connected to database '{db_name}' on host '{host}'")
        if db_name != "neondb":
            raise RuntimeError(f"Target is not neondb! Found: {db_name}")
            
        # 3. Verify Admin User ID 1
        admin_rows = conn.run("SELECT id, username, email, full_name, role, is_active FROM users WHERE id = 1")
        if not admin_rows:
            raise RuntimeError("CRITICAL ERROR: Administrator ID 1 not found in production database!")
        admin = admin_rows[0]
        if admin[4] != "admin" or not admin[5]:
            raise RuntimeError(f"CRITICAL ERROR: Production User ID 1 is not active admin! role={admin[4]}, active={admin[5]}")
        
        print(f"Verified Production Administrator: ID={admin[0]}, Email={admin[2]}, Name={admin[3]}, Role={admin[4]}, Active={admin[5]}")
        
        non_admin_users = conn.run("SELECT COUNT(*) FROM users WHERE id != 1")[0][0]
        print(f"Non-admin production accounts to be removed: {non_admin_users}")
        
        # 4. Check tables present in production
        existing_tables_rows = conn.run("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        existing_tables = set(r[0] for r in existing_tables_rows)
        print(f"Existing public tables ({len(existing_tables)}): {sorted(list(existing_tables))}")
        
        # 5. Start transaction
        conn.run("BEGIN;")
        print("Production transaction started.")
        
        # Clean smart tables if present
        for t in ["smart_action_items", "smart_decisions", "smart_dates", "conversation_summaries"]:
            if t in existing_tables:
                conn.run(f"DELETE FROM {t};")
                print(f"Cleaned table '{t}'.")
                
        if "conversation_preferences" in existing_tables:
            conn.run("DELETE FROM conversation_preferences WHERE user_id != 1;")
            print("Cleaned non-admin conversation_preferences.")
            
        if "reactions" in existing_tables:
            conn.run("DELETE FROM reactions;")
            print("Cleaned reactions.")
            
        if "message_translations" in existing_tables:
            conn.run("DELETE FROM message_translations;")
            print("Cleaned message_translations.")
            
        # Unlink documents from messages, conversations, groups
        if "documents" in existing_tables:
            conn.run("UPDATE documents SET message_id = NULL, conversation_id = NULL, group_id = NULL;")
            print("Unlinked documents from messages, conversations, and groups.")
            
        if "messages" in existing_tables:
            conn.run("UPDATE messages SET file_id = NULL, reply_to_id = NULL;")
            conn.run("DELETE FROM messages;")
            print("Cleaned messages.")
            
        if "document_versions" in existing_tables:
            conn.run("DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE uploader_id != 1) OR created_by_id != 1;")
            print("Cleaned non-admin document versions.")
            
        if "documents" in existing_tables:
            conn.run("DELETE FROM documents WHERE uploader_id != 1;")
            print("Cleaned non-admin documents.")
            
        if "group_members" in existing_tables:
            conn.run("DELETE FROM group_members;")
            print("Cleaned group_members.")
            
        if "groups" in existing_tables:
            conn.run("DELETE FROM groups;")
            print("Cleaned groups.")
            
        if "conversation_members" in existing_tables:
            conn.run("DELETE FROM conversation_members;")
            print("Cleaned conversation_members.")
            
        if "conversations" in existing_tables:
            conn.run("DELETE FROM conversations;")
            print("Cleaned conversations.")
            
        if "audit_logs" in existing_tables:
            conn.run("DELETE FROM audit_logs WHERE admin_id != 1;")
            print("Cleaned non-admin audit_logs.")
            
        if "otp_codes" in existing_tables:
            conn.run("DELETE FROM otp_codes WHERE email != 'frankline30999112@gmail.com';")
            print("Cleaned non-admin otp_codes.")
            
        if "account_access_requests" in existing_tables:
            conn.run("DELETE FROM account_access_requests WHERE email != 'frankline30999112@gmail.com';")
            print("Cleaned non-admin account_access_requests.")
            
        # Delete non-admin users
        conn.run("DELETE FROM users WHERE id != 1;")
        print("Removed all non-admin users.")
        
        # Ensure User 1 is active admin
        conn.run("""
            UPDATE users 
            SET role = 'admin', is_active = TRUE, account_status = 'active', status = 'active' 
            WHERE id = 1;
        """)
        print("Verified User 1 is active admin.")
        
        # Verify exactly 1 user remaining in production
        rem_users = conn.run("SELECT id, username, email, role, is_active FROM users")
        if len(rem_users) != 1:
            raise RuntimeError(f"Expected 1 user in production, found {len(rem_users)}!")
        print(f"Remaining production user verified: {rem_users[0]}")
        
        # Verify preserved admin documents
        admin_docs = conn.run("SELECT id, original_filename, uploader_id FROM documents")
        print(f"Preserved production administrator documents count: {len(admin_docs)}")
        for doc in admin_docs:
            print(f"  Doc ID {doc[0]}: {doc[1]} (uploader={doc[2]})")
            
        # Commit transaction
        conn.run("COMMIT;")
        print("=== PRODUCTION TRANSACTION COMMITTED SUCCESSFULLY ===")
        
    except Exception as e:
        conn.run("ROLLBACK;")
        print(f"CRITICAL: Production transaction rolled back due to error: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    cleanup_production()
