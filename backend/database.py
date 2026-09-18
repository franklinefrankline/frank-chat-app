import os
import hashlib
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
                if "updated_at" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NULL"))
                if "email_verified" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT TRUE"))
                # Ensure all users are marked verified so verification is never a requirement
                conn.execute(text("UPDATE users SET email_verified = TRUE WHERE email_verified IS NULL OR email_verified = FALSE"))
                try:
                    conn.execute(text("DROP TABLE IF EXISTS email_verification_tokens"))
                except Exception as drop_err:
                    print(f"Drop tokens note: {drop_err}")
                if "role" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"))
                    conn.execute(text("UPDATE users SET role = 'user' WHERE role IS NULL"))
                if "is_active" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE"))
                    conn.execute(text("UPDATE users SET is_active = TRUE WHERE is_active IS NULL"))
                # Promote configured admin accounts
                admin_emails_env = os.getenv("ADMIN_EMAILS", "frankline30999112@gmail.com")
                admin_emails = [e.strip().lower() for e in admin_emails_env.split(",") if e.strip()]
                for adm_email in admin_emails:
                    try:
                        conn.execute(text("UPDATE users SET role = 'admin' WHERE LOWER(TRIM(email)) = :ae"), {"ae": adm_email})
                    except Exception as adm_e:
                        print(f"Admin promotion note: {adm_e}")

                # Ensure primary admin Frankline / frankline30999112@gmail.com is seeded/updated with password '#Frankline2006'
                try:
                    admin_salt = os.urandom(16)
                    admin_key = hashlib.pbkdf2_hmac("sha256", "#Frankline2006".encode("utf-8"), admin_salt, 100000)
                    admin_pwd_hash = f"pbkdf2_sha256${admin_salt.hex()}${admin_key.hex()}"
                    existing_admin = conn.execute(
                        text("SELECT id FROM users WHERE LOWER(TRIM(email)) = 'frankline30999112@gmail.com' OR username = 'Frankline'")
                    ).fetchone()
                    if existing_admin:
                        conn.execute(
                            text("UPDATE users SET hashed_password = :hp, role = 'admin', is_active = TRUE, email_verified = TRUE WHERE id = :uid"),
                            {"hp": admin_pwd_hash, "uid": existing_admin[0]}
                        )
                    else:
                        import secrets
                        chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
                        fid = "".join(secrets.choice(chars) for _ in range(6))
                        conn.execute(
                            text("""
                                INSERT INTO users (username, email, full_name, hashed_password, role, is_active, email_verified, frank_id, bio, created_at)
                                VALUES ('Frankline', 'frankline30999112@gmail.com', 'Frankline', :hp, 'admin', TRUE, TRUE, :fid, 'FRANK Administrator', CURRENT_TIMESTAMP)
                            """),
                            {"hp": admin_pwd_hash, "fid": fid}
                        )
                except Exception as adm_pwd_e:
                    print(f"Admin seeding note: {adm_pwd_e}")
                # Normalize all existing emails to lowercase trimmed
                try:
                    conn.execute(text("UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email != LOWER(TRIM(email))"))
                except Exception as e:
                    print(f"Email normalization note: {e}")
                conn.execute(text("UPDATE users SET bio = REPLACE(REPLACE(bio, 'ChatApp', 'FRANK'), 'QENVO', 'FRANK') WHERE bio LIKE '%ChatApp%' OR bio LIKE '%QENVO%'"))

            # Backfill any users missing frank_id (NEVER replace existing frank_id)
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

            # Create unique indexes on users(frank_id) and users(email) if not exists
            with engine.begin() as conn:
                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_frank_id ON users (frank_id)"))
                except Exception:
                    pass
                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email ON users (email)"))
                except Exception:
                    pass

        # 2. Migrate conversations table
        is_sqlite = DATABASE_URL.startswith("sqlite")
        if "conversations" not in table_names:
            Base.metadata.tables["conversations"].create(bind=engine, checkfirst=True)
        else:
            conv_cols = [col["name"] for col in inspector.get_columns("conversations")]
            with engine.begin() as conn:
                if "conversation_type" not in conv_cols:
                    conn.execute(text("ALTER TABLE conversations ADD COLUMN conversation_type VARCHAR(20) DEFAULT 'private'"))
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
                if "is_edited" not in msg_cols:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE"))
                if "is_deleted" not in msg_cols:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE"))

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

        # 6. Ensure password_reset_tokens table exists
        if "password_reset_tokens" not in table_names:
            with engine.begin() as conn:
                if is_sqlite:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS password_reset_tokens (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            token_hash VARCHAR(64) NOT NULL UNIQUE,
                            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                            used BOOLEAN DEFAULT FALSE NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS password_reset_tokens (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            token_hash VARCHAR(64) NOT NULL UNIQUE,
                            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                            used BOOLEAN DEFAULT FALSE NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prt_user_id ON password_reset_tokens (user_id)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prt_token_hash ON password_reset_tokens (token_hash)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prt_expires_at ON password_reset_tokens (expires_at)"))
                except Exception as idx_err:
                    print(f"Index creation note: {idx_err}")

        # 7. Ensure email_verification_tokens table exists
        if "email_verification_tokens" not in table_names:
            with engine.begin() as conn:
                if is_sqlite:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS email_verification_tokens (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            token_hash VARCHAR(64) NOT NULL UNIQUE,
                            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                            used BOOLEAN DEFAULT FALSE NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS email_verification_tokens (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            token_hash VARCHAR(64) NOT NULL UNIQUE,
                            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                            used BOOLEAN DEFAULT FALSE NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_evt_user_id ON email_verification_tokens (user_id)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_evt_token_hash ON email_verification_tokens (token_hash)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_evt_expires_at ON email_verification_tokens (expires_at)"))
                except Exception as idx_err:
                    print(f"Index creation note: {idx_err}")

        # 8. Ensure admin_audit_logs table exists
        if "admin_audit_logs" not in table_names:
            with engine.begin() as conn:
                if is_sqlite:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS admin_audit_logs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            admin_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                            action VARCHAR(50) NOT NULL,
                            target_user_id INTEGER NULL,
                            target_identifier VARCHAR(120) NULL,
                            details TEXT NULL,
                            ip_address VARCHAR(45) NULL,
                            status VARCHAR(20) DEFAULT 'success' NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS admin_audit_logs (
                            id SERIAL PRIMARY KEY,
                            admin_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                            action VARCHAR(50) NOT NULL,
                            target_user_id INTEGER NULL,
                            target_identifier VARCHAR(120) NULL,
                            details TEXT NULL,
                            ip_address VARCHAR(45) NULL,
                            status VARCHAR(20) DEFAULT 'success' NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_aal_action ON admin_audit_logs (action)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_aal_admin_user_id ON admin_audit_logs (admin_user_id)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_aal_created_at ON admin_audit_logs (created_at)"))
                except Exception as idx_err:
                    print(f"Index creation note: {idx_err}")


    except Exception as e:
        print(f"Migration note: {e}")

try:
    check_and_migrate_db()
except Exception as e:
    print(f"Initial migration note: {e}")
