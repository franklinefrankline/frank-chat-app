import os
import sys
import shutil
import gzip
import logging
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger("frank.database")

# Locate .env file in backend directory or root directory if available
for env_candidate in [Path(__file__).resolve().parent / ".env", Path(__file__).resolve().parent.parent / ".env"]:
    if env_candidate.exists():
        try:
            import dotenv
            dotenv.load_dotenv(env_candidate, override=True)
            break
        except Exception:
            pass

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
DEFAULT_NEON_URL = "postgresql://neondb_owner:npg_8kgYbEIv9cAj@ep-gentle-butterfly-b4le0fyp.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"

is_serverless = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("VERCEL_ENV"))
is_sqlite_fallback = False

def setup_sqlite_engine():
    """
    Sets up a robust, resilient SQLite engine.
    In serverless (Vercel/Lambda), copies pre-seeded SQLite database to /tmp/chatapp.db so
    existing users, messages, and documents are preserved with full read-write permissions.
    """
    global is_sqlite_fallback
    is_sqlite_fallback = True
    backend_dir = Path(__file__).resolve().parent
    root_dir = backend_dir.parent

    # Determine writable target path
    if is_serverless or not os.access(backend_dir, os.W_OK):
        db_path = Path("/tmp/chatapp.db")
        if not db_path.exists() or db_path.stat().st_size == 0:
            seed_candidates = [
                backend_dir / "seed.sqlite.gz",
                backend_dir / "seed.sqlite",
                root_dir / "seed.sqlite.gz",
                root_dir / "seed.sqlite",
                root_dir / "backend" / "seed.sqlite.gz",
                root_dir / "backend" / "seed.sqlite",
                root_dir.parent / "seed.sqlite.gz",
                root_dir.parent / "backend" / "seed.sqlite.gz",
                backend_dir / "chatapp.db",
                root_dir / "chatapp.db",
                root_dir / "backend" / "chatapp.db",
            ]
            seeded = False
            for cand in seed_candidates:
                if cand.exists() and cand.stat().st_size > 0:
                    try:
                        if cand.name.endswith(".gz"):
                            with gzip.open(cand, "rb") as f_in, open(db_path, "wb") as f_out:
                                shutil.copyfileobj(f_in, f_out)
                        else:
                            shutil.copy2(cand, db_path)
                        seeded = True
                        logger.info(f"[FRANK DB] Seeded SQLite database from {cand.name} to /tmp/chatapp.db")
                        break
                    except Exception as e:
                        logger.warning(f"[FRANK DB] Failed copying seed {cand}: {e}")
            if not seeded:
                logger.info("[FRANK DB] Initializing fresh SQLite database at /tmp/chatapp.db")
        sqlite_url = f"sqlite:///{db_path.resolve().as_posix()}"
    else:
        # Local development / persistent disk
        local_db = backend_dir / "chatapp.db"
        root_db = root_dir / "chatapp.db"
        if local_db.exists():
            sqlite_url = f"sqlite:///{local_db.resolve().as_posix()}"
        elif root_db.exists():
            sqlite_url = f"sqlite:///{root_db.resolve().as_posix()}"
        else:
            sqlite_url = f"sqlite:///{local_db.resolve().as_posix()}"

    eng = create_engine(
        sqlite_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True
    )
    return eng, sqlite_url

def init_engine():
    global DATABASE_URL
    target_url = DATABASE_URL or DEFAULT_NEON_URL

    if target_url.startswith("sqlite"):
        return setup_sqlite_engine()

    if target_url.startswith("postgres://"):
        target_url = target_url.replace("postgres://", "postgresql://", 1)

    use_pg8000 = False
    if target_url.startswith("postgresql://") and not any(
        target_url.startswith(p) for p in ["postgresql+psycopg2://", "postgresql+pg8000://", "postgresql+asyncpg://", "postgresql+psycopg://"]
    ):
        has_psycopg = False
        try:
            import psycopg2  # noqa: F401
            has_psycopg = True
        except Exception:
            try:
                import psycopg  # noqa: F401
                has_psycopg = True
                target_url = target_url.replace("postgresql://", "postgresql+psycopg://", 1)
            except Exception:
                has_psycopg = False
        if not has_psycopg:
            target_url = target_url.replace("postgresql://", "postgresql+pg8000://", 1)
            use_pg8000 = True
    elif target_url.startswith("postgresql+pg8000://"):
        use_pg8000 = True

    engine_kwargs = {
        "pool_pre_ping": True,
        "pool_recycle": 300
    }
    pool_str = (os.getenv("DB_POOL_SIZE") or "").strip()
    engine_kwargs["pool_size"] = int(pool_str) if pool_str.isdigit() else 10
    overflow_str = (os.getenv("DB_MAX_OVERFLOW") or "").strip()
    engine_kwargs["max_overflow"] = int(overflow_str) if overflow_str.isdigit() else 20

    if use_pg8000:
        import ssl
        import urllib.parse
        parsed = urllib.parse.urlparse(target_url)
        qs = urllib.parse.parse_qs(parsed.query)
        needs_ssl = "sslmode" in qs or "ssl" in qs or "neon.tech" in target_url or "aws.neon.tech" in target_url
        qs.pop("sslmode", None)
        qs.pop("ssl", None)
        new_query = urllib.parse.urlencode(qs, doseq=True)
        target_url = urllib.parse.urlunparse(parsed._replace(query=new_query))
        if needs_ssl:
            engine_kwargs["connect_args"] = {"ssl_context": ssl.create_default_context()}

    # Actively test connection before committing to PostgreSQL engine
    try:
        cand_engine = create_engine(target_url, **engine_kwargs)
        with cand_engine.connect() as test_conn:
            test_conn.execute(text("SELECT 1"))
        logger.info("[FRANK DB] Successfully connected to PostgreSQL primary database.")
        DATABASE_URL = target_url
        return cand_engine, target_url
    except Exception as e:
        logger.warning(
            f"[FRANK DB WARNING] Primary PostgreSQL database failed ({type(e).__name__}: {str(e)[:160]}). "
            "Activating resilient SQLite fallback to maintain continuous service."
        )
        return setup_sqlite_engine()

engine, DATABASE_URL = init_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)
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
        import models
        # Ensure any new tables (like conversations, consent_records, privacy_data_requests, etc.) are created
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
                if "deleted_for_sender" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN deleted_for_sender BOOLEAN DEFAULT FALSE"))
                if "deleted_for_recipient" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN deleted_for_recipient BOOLEAN DEFAULT FALSE"))
                if "deleted_for_everyone" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN deleted_for_everyone BOOLEAN DEFAULT FALSE"))
                if "delivered_at" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN delivered_at TIMESTAMP NULL"))
                if "read_at" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN read_at TIMESTAMP NULL"))
                if "is_pinned" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE"))
                if "pinned_at" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN pinned_at TIMESTAMP NULL"))
                if "is_forwarded" not in columns:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN is_forwarded BOOLEAN DEFAULT FALSE"))
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_direct_conv ON messages (sender_id, recipient_id, id)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_group_conv ON messages (group_id, id)"))
                except Exception:
                    pass

            if "documents" in tables:
                columns = [col["name"] for col in inspector.get_columns("documents")]
                if "duration" not in columns:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN duration FLOAT NULL"))
                if "file_data" not in columns:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN file_data TEXT NULL"))
                if "current_version_number" not in columns:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN current_version_number INTEGER DEFAULT 1"))

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
                if "is_active" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE"))
                    conn.execute(text("UPDATE users SET is_active = TRUE WHERE is_active IS NULL"))
                    conn.execute(text("UPDATE users SET is_active = FALSE WHERE account_status IN ('disabled', 'deactivated')"))
                if "language" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN language VARCHAR(10) DEFAULT 'en'"))
                    conn.execute(text("UPDATE users SET language = 'en' WHERE language IS NULL"))
                if "oauth_provider" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50) NULL"))
                if "oauth_id" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN oauth_id VARCHAR(100) NULL"))

                result = conn.execute(text("SELECT id FROM users WHERE frank_id IS NULL OR frank_id = ''")).fetchall()
                alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
                for row in result:
                    uid = row[0]
                    while True:
                        new_fid = "".join(secrets.choice(alphabet) for _ in range(6))
                        exists = conn.execute(text("SELECT 1 FROM users WHERE frank_id = :fid"), {"fid": new_fid}).fetchone()
                        if not exists:
                            break
                    conn.execute(text("UPDATE users SET frank_id = :fid WHERE id = :uid"), {"fid": new_fid, "uid": uid})

                conn.execute(text("UPDATE users SET bio = REPLACE(REPLACE(bio, 'ChatApp', 'FRANK'), 'QENVO', 'FRANK') WHERE bio LIKE '%ChatApp%' OR bio LIKE '%QENVO%'"))

                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_frank_id ON users(frank_id)"))
                except Exception:
                    pass

            if "conversations" in tables:
                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_users ON conversations(user_a_id, user_b_id)"))
                except Exception:
                    pass

                # Ensure conversation_members table exists
                try:
                    if "conversation_members" not in tables:
                        if DATABASE_URL.startswith("sqlite"):
                            conn.execute(text("""
                                CREATE TABLE IF NOT EXISTS conversation_members (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                    role VARCHAR(20) DEFAULT 'member',
                                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                    UNIQUE (conversation_id, user_id)
                                )
                            """))
                        else:
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
                except Exception as ex:
                    print(f"Table creation note: {ex}")

                # Safely populate conversation_members from existing conversations
                try:
                    conv_rows = conn.execute(text("SELECT id, user_a_id, user_b_id FROM conversations")).fetchall()
                    for crow in conv_rows:
                        cid, ua, ub = crow[0], crow[1], crow[2]
                        for uid in set([ua, ub]):
                            existing_m = conn.execute(
                                text("SELECT 1 FROM conversation_members WHERE conversation_id = :cid AND user_id = :uid"),
                                {"cid": cid, "uid": uid}
                            ).fetchone()
                            if not existing_m:
                                conn.execute(
                                    text("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (:cid, :uid, 'member')"),
                                    {"cid": cid, "uid": uid}
                                )
                except Exception as ex:
                    print(f"Backfill note: {ex}")

            if "conversation_summaries" in tables:
                columns = [col["name"] for col in inspector.get_columns("conversation_summaries")]
                if "message_id" not in columns:
                    conn.execute(text("ALTER TABLE conversation_summaries ADD COLUMN message_id INTEGER NULL"))
                if "attachment_id" not in columns:
                    conn.execute(text("ALTER TABLE conversation_summaries ADD COLUMN attachment_id INTEGER NULL"))

            if "smart_action_items" in tables:
                columns = [col["name"] for col in inspector.get_columns("smart_action_items")]
                if "assigned_to" not in columns:
                    conn.execute(text("ALTER TABLE smart_action_items ADD COLUMN assigned_to VARCHAR(100) NULL"))
                if "due_date" not in columns:
                    conn.execute(text("ALTER TABLE smart_action_items ADD COLUMN due_date VARCHAR(100) NULL"))

            if "smart_dates" in tables:
                columns = [col["name"] for col in inspector.get_columns("smart_dates")]
                if "context" not in columns:
                    conn.execute(text("ALTER TABLE smart_dates ADD COLUMN context VARCHAR(500) NULL"))

        # Seed default retention rules if table is empty
        try:
            with SessionLocal() as s_db:
                if s_db.query(models.DataRetentionRule).count() == 0:
                    default_rules = [
                        models.DataRetentionRule(
                            data_category="chat_messages",
                            category_label="Chat & Group Messages",
                            purpose="Provision of real-time messaging, communication continuity, and lawful dispute resolution under contract.",
                            retention_period_days=730,
                            is_active=True,
                            deletion_method="anonymize",
                            legal_exception="Section 8(7) DPDP Act: Preserved during active account tenure and retained for lawful communication partner access."
                        ),
                        models.DataRetentionRule(
                            data_category="uploaded_documents",
                            category_label="Uploaded Documents & Attachments",
                            purpose="File sharing, office document collaboration, and storage within active chats.",
                            retention_period_days=730,
                            is_active=True,
                            deletion_method="purge_file",
                            legal_exception="Shared files remain accessible to mutual group and conversation participants."
                        ),
                        models.DataRetentionRule(
                            data_category="inactive_accounts",
                            category_label="Deactivated / Inactive Accounts",
                            purpose="Grace period for account recovery following deactivation request.",
                            retention_period_days=180,
                            is_active=True,
                            deletion_method="anonymize",
                            legal_exception="Permanent anonymization of personal credentials after grace period."
                        ),
                        models.DataRetentionRule(
                            data_category="security_audit_logs",
                            category_label="Security & Compliance Audit Logs",
                            purpose="Security incident investigation, accountability, and fraud prevention.",
                            retention_period_days=365,
                            is_active=True,
                            deletion_method="anonymize",
                            legal_exception="Statutory compliance and security verification exception under DPDP Act."
                        ),
                        models.DataRetentionRule(
                            data_category="ai_transients",
                            category_label="Smart Conversation AI Transients",
                            purpose="Action items, summaries, decisions, and dates generated upon user invocation.",
                            retention_period_days=90,
                            is_active=True,
                            deletion_method="anonymize",
                            legal_exception="Subject to immediate erasure upon user consent withdrawal or chat deletion."
                        ),
                        models.DataRetentionRule(
                            data_category="privacy_requests",
                            category_label="Privacy Requests & Grievance Logs",
                            purpose="Proof of fulfillment of Data Principal rights under DPDP Act 2023.",
                            retention_period_days=1095,
                            is_active=True,
                            deletion_method="anonymize",
                            legal_exception="Legal evidentiary requirement for 3-year limitation period."
                        )
                    ]
                    s_db.add_all(default_rules)
                    s_db.commit()
        except Exception as seed_ex:
            print(f"Retention rules seed note: {seed_ex}")
    except Exception as e:
        print(f"Migration note: {e}")

check_and_migrate_db()

def ensure_admin_user():
    """Guarantees default administrator account exists with valid credentials."""
    try:
        from security import hash_password
        import models
        with SessionLocal() as db:
            admin_user = db.query(models.User).filter(
                (models.User.email == "frankline30999112@gmail.com") |
                (models.User.username == "frankline30999112@gmail.com") |
                (models.User.username == "frankline") |
                (models.User.username == "admin") |
                (models.User.role == "admin")
            ).first()
            if not admin_user:
                admin_user = models.User(
                    username="frankline30999112@gmail.com",
                    email="frankline30999112@gmail.com",
                    frank_id="ADM001",
                    full_name="Frankline",
                    bio="System Administrator",
                    hashed_password=hash_password("#Frankline2006"),
                    role="admin",
                    account_status="active",
                    is_online=False
                )
                db.add(admin_user)
                db.commit()
    except Exception as e:
        logger.warning(f"Admin ensure note: {e}")

try:
    ensure_admin_user()
except Exception:
    pass
