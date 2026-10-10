from sqlalchemy import create_engine, text

NEON_URL = "postgresql+pg8000://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb"

def add_indexes():
    engine = create_engine(NEON_URL)
    with engine.begin() as conn:
        print("Creating ix_messages_direct_a...")
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_direct_a ON messages (sender_id, recipient_id, created_at DESC) WHERE group_id IS NULL;"))
        print("Creating ix_messages_direct_b...")
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_direct_b ON messages (recipient_id, sender_id, created_at DESC) WHERE group_id IS NULL;"))
        print("Creating ix_messages_unread...")
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_unread ON messages (recipient_id, sender_id, status) WHERE group_id IS NULL AND status != 'read';"))
        print("Creating ix_reactions_user_id...")
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_reactions_user_id ON reactions (user_id);"))
    print("All performance indexes created on Neon PostgreSQL successfully!")

if __name__ == "__main__":
    add_indexes()
