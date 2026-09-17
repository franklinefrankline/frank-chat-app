import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Locate .env file in backend directory if available
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ.setdefault(key.strip(), val.strip())
    except Exception:
        pass

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        DATABASE_URL = "sqlite:////tmp/chatapp.db"
    else:
        DATABASE_URL = "sqlite:///./chatapp.db"

# Normalize PostgreSQL URL for SQLAlchemy 2.0+
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine_kwargs = {
    "pool_pre_ping": True
}

if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "10"))
    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "20"))

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_unique_frank_id(db_session=None) -> str:
    import string
    import secrets
    chars = string.ascii_uppercase + string.digits

    # Close session if created locally
    local_session = False
    if db_session is None:
        db_session = SessionLocal()
        local_session = True

    try:
        from sqlalchemy import text
        for _ in range(200):
            candidate = "".join(secrets.choice(chars) for _ in range(6))
            row = db_session.execute(
                text("SELECT id FROM users WHERE frank_id = :fid"),
                {"fid": candidate}
            ).first()
            if not row:
                return candidate
        raise RuntimeError("Unable to generate unique 6-character FRANK ID")
    finally:
        if local_session:
            db_session.close()


def check_and_migrate_db():
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        table_names = inspector.get_table_names()

        # 1. Migrate users table
        if "users" in table_names:
            user_cols = [col["name"] for col in inspector.get_columns("users")]
            with engine.begin() as conn:
                if "frank_id" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN frank_id VARCHAR(6) NULL"))
                conn.execute(text("UPDATE users SET bio = REPLACE(REPLACE(bio, 'ChatApp', 'FRANK'), 'QENVO', 'FRANK') WHERE bio LIKE '%ChatApp%' OR bio LIKE '%QENVO%'"))

            # Backfill any users missing frank_id
            db_session = SessionLocal()
            try:
                users_missing_fid = db_session.execute(text("SELECT id, username FROM users WHERE frank_id IS NULL OR frank_id = ''")).fetchall()
                for u in users_missing_fid:
                    new_fid = generate_unique_frank_id(db_session)
                    db_session.execute(
                        text("UPDATE users SET frank_id = :fid WHERE id = :uid"),
                        {"fid": new_fid, "uid": u.id}
                    )
                db_session.commit()
            except Exception as e:
                db_session.rollback()
                print(f"Backfill note: {e}")
            finally:
                db_session.close()

            # Create unique index on users(frank_id) if not exists
            with engine.begin() as conn:
                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_frank_id ON users (frank_id)"))
                except Exception:
                    pass

        # 2. Migrate conversations table
        is_sqlite = DATABASE_URL.startswith("sqlite")
        if "conversations" not in table_names:
            models.Base.metadata.tables["conversations"].create(bind=engine, checkfirst=True)
        else:
            if is_sqlite:
                cols = inspector.get_columns("conversations")
                id_col = next((c for c in cols if c["name"] == "id"), None)
                if id_col and str(id_col["type"]).upper() == "SERIAL":
                    with engine.begin() as conn:
                        conn.execute(text("DROP TABLE conversations"))
                    models.Base.metadata.tables["conversations"].create(bind=engine, checkfirst=True)
            with engine.begin() as conn:
                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_pair ON conversations (user_a_id, user_b_id)"))
                except Exception:
                    pass

        # 3. Migrate messages table
        if "messages" in table_names:
            msg_cols = [col["name"] for col in inspector.get_columns("messages")]
            with engine.begin() as conn:
                if "message_type" not in msg_cols:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'"))
                if "file_id" not in msg_cols:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN file_id INTEGER NULL"))
                if "updated_at" not in msg_cols:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NULL"))
                if "conversation_id" not in msg_cols:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN conversation_id INTEGER NULL REFERENCES conversations(id)"))

        # 4. Migrate groups table
        if "groups" in table_names:
            grp_cols = [col["name"] for col in inspector.get_columns("groups")]
            with engine.begin() as conn:
                if "is_private" not in grp_cols:
                    conn.execute(text("ALTER TABLE groups ADD COLUMN is_private BOOLEAN DEFAULT TRUE"))

        # 5. Migrate group_members table roles
        if "group_members" in table_names and "groups" in table_names:
            with engine.begin() as conn:
                # Update creators to have role='owner' if role was admin or member
                conn.execute(text("""
                    UPDATE group_members 
                    SET role = 'owner' 
                    WHERE id IN (
                        SELECT gm.id FROM group_members gm 
                        JOIN groups g ON gm.group_id = g.id 
                        WHERE gm.user_id = g.created_by AND gm.role != 'owner'
                    )
                """))

    except Exception as e:
        print(f"Migration note: {e}")

try:
    check_and_migrate_db()
except Exception as e:
    print(f"Initial migration note: {e}")
