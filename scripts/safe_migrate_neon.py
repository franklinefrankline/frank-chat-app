import ssl
from sqlalchemy import create_engine, text

url = 'postgresql+pg8000://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb'
engine = create_engine(url, connect_args={'ssl_context': ssl.create_default_context()})

with engine.begin() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS conversation_members (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(20) DEFAULT 'member',
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_conv_member UNIQUE (conversation_id, user_id)
        )
    """))
    print("conversation_members table ensured in Neon PostgreSQL!")

    conv_rows = conn.execute(text("SELECT id, user_a_id, user_b_id FROM conversations")).fetchall()
    for crow in conv_rows:
        cid, ua, ub = crow[0], crow[1], crow[2]
        for uid in set([ua, ub]):
            conn.execute(text("""
                INSERT INTO conversation_members (conversation_id, user_id, role)
                VALUES (:cid, :uid, 'member')
                ON CONFLICT (conversation_id, user_id) DO NOTHING
            """), {"cid": cid, "uid": uid})
    print(f"Migrated {len(conv_rows)} conversations to conversation_members!")

with engine.connect() as conn:
    tables = [r[0] for r in conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).fetchall()]
    print("Public tables in Neon DB:", sorted(tables))
