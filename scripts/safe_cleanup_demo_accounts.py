import sqlite3
import shutil
import os
from datetime import datetime

def safe_cleanup_demo_accounts():
    db_path = "backend/chatapp.db"
    if not os.path.exists(db_path):
        print(f"Error: {db_path} does not exist!")
        return

    # 1. Back up the database
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"backend/chatapp.db.backup_{timestamp}.db"
    shutil.copy2(db_path, backup_path)
    print(f"[Backup] Successfully backed up database to: {backup_path}")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = OFF") # Handle reassignments safely before deletions

    manual_ids = {1, 23, 270, 274, 275, 276}
    demo_ids = [2, 3, 4] # Alex, Sarah, David

    print("\n[Verification Before Deletion]")
    cur.execute(f"SELECT id, username, email FROM users WHERE id IN ({','.join(map(str, demo_ids))})")
    confirmed_demos = cur.fetchall()
    print("Confirmed Demo Accounts to Remove:")
    for d in confirmed_demos:
        print(f"  ID={d[0]}: username='{d[1]}', email='{d[2]}'")

    cur.execute(f"SELECT id, username, email FROM users WHERE id IN ({','.join(map(str, manual_ids))})")
    manual_accounts = cur.fetchall()
    print("Manual Accounts to Strictly Preserve:")
    for m in manual_accounts:
        print(f"  ID={m[0]}: username='{m[1]}', email='{m[2]}'")

    # Count manual messages before cleanup
    cur.execute(f"SELECT COUNT(*) FROM messages WHERE sender_id IN ({','.join(map(str, manual_ids))}) OR recipient_id IN ({','.join(map(str, manual_ids))})")
    manual_msg_count_before = cur.fetchone()[0]
    print(f"Manual user messages before cleanup: {manual_msg_count_before}")

    # Begin cleanup transaction
    conn.execute("BEGIN TRANSACTION")
    try:
        # A. Clean up demo-to-demo messages
        cur.execute("""
            DELETE FROM messages 
            WHERE (sender_id IN (2, 3, 4) AND recipient_id IN (2, 3, 4))
        """)
        demo_msgs_deleted = cur.rowcount
        print(f"[Cleanup] Deleted {demo_msgs_deleted} demo-internal messages.")

        # B. For manual user messages where recipient was a demo account, preserve the message record
        cur.execute("""
            UPDATE messages 
            SET recipient_id = NULL 
            WHERE sender_id NOT IN (2, 3, 4) AND recipient_id IN (2, 3, 4)
        """)
        reassigned_recipients = cur.rowcount
        print(f"[Cleanup] Reassigned {reassigned_recipients} messages from manual users to preserve their chat history.")

        # C. For any remaining messages sent by demo accounts to manual accounts (if any)
        cur.execute("""
            DELETE FROM messages 
            WHERE sender_id IN (2, 3, 4)
        """)
        demo_sender_deleted = cur.rowcount
        print(f"[Cleanup] Removed {demo_sender_deleted} inbound demo messages.")

        # D. Clean up conversations strictly between demo accounts
        cur.execute("""
            DELETE FROM conversations 
            WHERE user_a_id IN (2, 3, 4) AND user_b_id IN (2, 3, 4)
        """)
        demo_convs_deleted = cur.rowcount
        print(f"[Cleanup] Deleted {demo_convs_deleted} demo-internal conversations.")

        # For conversations involving a demo user and a manual user, remove the conversation container safely
        cur.execute("""
            DELETE FROM conversations 
            WHERE user_a_id IN (2, 3, 4) OR user_b_id IN (2, 3, 4)
        """)
        print(f"[Cleanup] Cleaned remaining demo conversations.")

        # E. Clean group_members and conversation_members for demo users
        cur.execute("DELETE FROM group_members WHERE user_id IN (2, 3, 4)")
        print(f"[Cleanup] Removed {cur.rowcount} demo group memberships.")

        cur.execute("DELETE FROM conversation_members WHERE user_id IN (2, 3, 4)")
        print(f"[Cleanup] Removed {cur.rowcount} demo conversation memberships.")

        # F. Clean reactions by demo users
        cur.execute("DELETE FROM reactions WHERE user_id IN (2, 3, 4)")
        print(f"[Cleanup] Removed {cur.rowcount} demo reactions.")

        # G. Delete the demo user accounts
        cur.execute(f"DELETE FROM users WHERE id IN ({','.join(map(str, demo_ids))})")
        users_deleted = cur.rowcount
        print(f"[Cleanup] Deleted {users_deleted} confirmed demo user records.")

        conn.commit()
        print("\n[Transaction Committed Successfully]")

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Transaction rolled back due to error: {e}")
        conn.close()
        return

    # Verify state after transaction
    cur.execute(f"SELECT COUNT(*) FROM users WHERE id IN ({','.join(map(str, demo_ids))})")
    remaining_demos = cur.fetchone()[0]
    print(f"Remaining demo accounts in DB: {remaining_demos} (Expected: 0)")

    cur.execute(f"SELECT id, username, email FROM users WHERE id IN ({','.join(map(str, manual_ids))})")
    remaining_manuals = cur.fetchall()
    print(f"Remaining manual accounts in DB: {len(remaining_manuals)} (Expected: {len(manual_ids)})")

    cur.execute(f"SELECT COUNT(*) FROM messages WHERE sender_id IN ({','.join(map(str, manual_ids))})")
    manual_msg_count_after = cur.fetchone()[0]
    print(f"Manual user messages after cleanup: {manual_msg_count_after}")

    conn.close()

if __name__ == "__main__":
    safe_cleanup_demo_accounts()
