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

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chatapp.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
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
                conn.execute(text("UPDATE users SET bio = REPLACE(bio, 'ChatApp', 'QENVO') WHERE bio LIKE '%ChatApp%'"))
    except Exception as e:
        print(f"Migration note: {e}")

check_and_migrate_db()
