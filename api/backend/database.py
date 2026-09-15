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


def check_and_migrate_db():
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if "messages" in inspector.get_table_names():
            columns = [col["name"] for col in inspector.get_columns("messages")]
            with engine.begin() as conn:
                if "message_type" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'"))
                if "file_id" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN file_id INTEGER NULL"))
                if "updated_at" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN updated_at TIMESTAMP NULL"))
        if "users" in inspector.get_table_names():
            with engine.begin() as conn:
                conn.execute(text("UPDATE users SET bio = REPLACE(REPLACE(bio, 'ChatApp', 'FRANK'), 'QENVO', 'FRANK') WHERE bio LIKE '%ChatApp%' OR bio LIKE '%QENVO%'"))
    except Exception as e:
        print(f"Migration note: {e}")

check_and_migrate_db()
