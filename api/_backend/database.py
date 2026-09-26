import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Locate .env file in backend directory or root directory if available
for env_candidate in [Path(__file__).resolve().parent / ".env", Path(__file__).resolve().parent.parent / ".env"]:
    if env_candidate.exists():
        try:
            with open(env_candidate, "r", encoding="utf-8") as f:
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
        db_file = (Path(__file__).resolve().parent / "chatapp.db").as_posix()
        DATABASE_URL = f"sqlite:///{db_file}"


# Normalize PostgreSQL URL for SQLAlchemy 2.0+
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Ensure compatible PostgreSQL driver (fallback to pg8000 if psycopg2 is missing)
if DATABASE_URL.startswith("postgresql://") and not any(
    DATABASE_URL.startswith(p) for p in ["postgresql+psycopg2://", "postgresql+pg8000://", "postgresql+asyncpg://"]
):
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        try:
            import pg8000  # noqa: F401
            DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+pg8000://", 1)
        except ImportError:
            pass

engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 300
}

if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    pool_str = (os.getenv("DB_POOL_SIZE") or "").strip()
    engine_kwargs["pool_size"] = int(pool_str) if pool_str.isdigit() else 10
    overflow_str = (os.getenv("DB_MAX_OVERFLOW") or "").strip()
    engine_kwargs["max_overflow"] = int(overflow_str) if overflow_str.isdigit() else 20

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


def check_and_migrate_db():
    try:
        import secrets
        from sqlalchemy import inspect, text
        # Ensure any new tables (like conversations) are created
        Base.metadata.create_all(bind=engine)

        inspector = inspect(engine)
        tables = inspector.get_table_names()

        with engine.begin() as conn:
            if "messages" in tables:
                columns = [col["name"] for col in inspector.get_columns("messages")]
                if "message_type" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'"))
                if "file_id" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN file_id INTEGER NULL"))
                if "updated_at" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN updated_at TIMESTAMP NULL"))

            if "documents" in tables:
                columns = [col["name"] for col in inspector.get_columns("documents")]
                if "duration" not in columns:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN duration FLOAT NULL"))
                if "file_data" not in columns:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN file_data TEXT NULL"))

            if "groups" in tables:
                columns = [col["name"] for col in inspector.get_columns("groups")]
                if "privacy" not in columns:
                    conn.execute(text("ALTER TABLE groups ADD COLUMN privacy VARCHAR(20) DEFAULT 'private'"))
                    conn.execute(text("UPDATE groups SET privacy = 'private' WHERE privacy IS NULL"))

            if "users" in tables:
                columns = [col["name"] for col in inspector.get_columns("users")]
                if "name" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100) NULL"))
                    if "full_name" in columns:
                        conn.execute(text("UPDATE users SET name = full_name WHERE name IS NULL"))
                if "full_name" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(100) NULL"))
                    if "name" in columns:
                        conn.execute(text("UPDATE users SET full_name = name WHERE full_name IS NULL"))
                if "password_hash" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL"))
                    if "hashed_password" in columns:
                        conn.execute(text("UPDATE users SET password_hash = hashed_password WHERE password_hash IS NULL"))
                if "hashed_password" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255) NULL"))
                    if "password_hash" in columns:
                        conn.execute(text("UPDATE users SET hashed_password = password_hash WHERE hashed_password IS NULL"))
                if "updated_at" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NULL"))
                    if "created_at" in columns:
                        conn.execute(text("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL"))
                if "status" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'"))
                conn.execute(text("UPDATE users SET status = 'active' WHERE status IS NULL OR status IN ('offline', 'online', '')"))
                if "frank_id" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN frank_id VARCHAR(6) NULL"))
                if "role" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"))
                    conn.execute(text("UPDATE users SET role = 'user' WHERE role IS NULL"))
                if "account_status" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN account_status VARCHAR(20) DEFAULT 'active'"))
                    conn.execute(text("UPDATE users SET account_status = 'active' WHERE account_status IS NULL"))
                if "language" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN language VARCHAR(10) DEFAULT 'en'"))
                    conn.execute(text("UPDATE users SET language = 'en' WHERE language IS NULL"))

                result = conn.execute(text("SELECT id FROM users WHERE frank_id IS NULL OR frank_id = ''")).fetchall()
                alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
                for row in result:
                    uid = row[0]
                    new_fid = "".join(secrets.choice(alphabet) for _ in range(6))
                    conn.execute(text("UPDATE users SET frank_id = :fid WHERE id = :uid"), {"fid": new_fid, "uid": uid})

                conn.execute(text("UPDATE users SET bio = REPLACE(REPLACE(bio, 'ChatApp', 'FRANK'), 'QENVO', 'FRANK') WHERE bio LIKE '%ChatApp%' OR bio LIKE '%QENVO%'"))

                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_frank_id ON users(frank_id)"))
                except Exception:
                    pass

            if "conversations" in tables:
                try:
                    conn.execute(text("DELETE FROM conversations WHERE id NOT IN (SELECT MIN(id) FROM conversations GROUP BY user_a_id, user_b_id)"))
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_users ON conversations(user_a_id, user_b_id)"))
                except Exception:
                    pass
    except Exception as e:
        print(f"Migration note: {e}")

check_and_migrate_db()

