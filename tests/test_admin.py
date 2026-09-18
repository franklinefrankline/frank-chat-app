import sys
import os
import uuid
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))
os.environ["DATABASE_URL"] = f"sqlite:///{str(backend_dir / 'chatapp.db').replace('\\', '/')}"

import database
import models
import schemas
import security
from services.user_cleanup import delete_user_data_only, delete_user_account_permanently, safe_delete_file_from_disk
from routes import admin as admin_module

def run_tests():
    print("==================================================")
    print("RUNNING FRANK ADMIN & ACCOUNT DELETION TEST SUITE")
    print("==================================================")

    db = database.SessionLocal()
    try:
        # 1. Verify User model has role, is_active and AdminAuditLog table exists
        columns = [c.name for c in models.User.__table__.columns]
        assert "role" in columns, "role column missing on User model"
        assert "is_active" in columns, "is_active column missing on User model"
        assert models.AdminAuditLog.__tablename__ == "admin_audit_logs"
        print("[PASS] 1. Database schema and models verified (role, is_active, admin_audit_logs)")

        # 2. Test Admin Security Dependency logic
        regular_user = models.User(
            email=f"regular_{uuid.uuid4().hex[:6]}@test.com",
            username=f"reg_{uuid.uuid4().hex[:6]}",
            full_name="Regular User",
            hashed_password=security.hash_password("Pass12345!"),
            role="user",
            is_active=True
        )
        admin_user = models.User(
            email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
            username=f"adm_{uuid.uuid4().hex[:6]}",
            full_name="System Admin",
            hashed_password=security.hash_password("AdminPass123!"),
            role="admin",
            is_active=True
        )
        disabled_user = models.User(
            email=f"disabled_{uuid.uuid4().hex[:6]}@test.com",
            username=f"dis_{uuid.uuid4().hex[:6]}",
            full_name="Disabled User",
            hashed_password=security.hash_password("Pass12345!"),
            role="user",
            is_active=False
        )
        db.add_all([regular_user, admin_user, disabled_user])
        db.commit()
        db.refresh(regular_user)
        db.refresh(admin_user)
        db.refresh(disabled_user)

        # Admin user check
        assert admin_user.role == "admin"
        assert admin_user.is_active is True

        # Test require_admin rule
        try:
            security.get_current_admin(current_user=regular_user)
            assert False, "Regular user should have been rejected by get_current_admin"
        except Exception as e:
            assert e.status_code == 403
            print("[PASS] 2. Regular user correctly denied admin access with HTTP 403")

        admin_check = security.get_current_admin(current_user=admin_user)
        assert admin_check.id == admin_user.id
        print("[PASS] 3. Admin user correctly granted access by get_current_admin")

        # 3. Test User Data Wipe (Preserves Account, clears messages)
        # Create a test message from regular_user
        test_msg = models.Message(
            sender_id=regular_user.id,
            content="Hello world test message",
            message_type="text"
        )
        db.add(test_msg)
        db.commit()

        # Check message count
        msg_count = db.query(models.Message).filter(models.Message.sender_id == regular_user.id).count()
        assert msg_count >= 1

        # Execute data wipe
        wipe_result = delete_user_data_only(db, regular_user)
        assert wipe_result["messages_deleted"] >= 1
        # Account should still exist
        refreshed_user = db.query(models.User).filter(models.User.id == regular_user.id).first()
        assert refreshed_user is not None
        assert refreshed_user.username == regular_user.username
        print(f"[PASS] 4. User data wipe succeeded (messages wiped: {wipe_result['messages_deleted']}, account retained)")

        # 4. Test Permanent Account Deletion & Group Reassignment
        # Create group owned by regular_user with admin_user as another member
        test_grp = models.Group(
            name="Ownership Transfer Group",
            created_by=regular_user.id
        )
        db.add(test_grp)
        db.commit()
        db.refresh(test_grp)

        mem1 = models.GroupMember(group_id=test_grp.id, user_id=regular_user.id, role="admin")
        mem2 = models.GroupMember(group_id=test_grp.id, user_id=admin_user.id, role="member")
        db.add_all([mem1, mem2])
        db.commit()

        # Delete regular_user permanently
        del_result = delete_user_account_permanently(db, regular_user)
        assert del_result["status"] == "account_permanently_deleted"

        # Verify regular_user is completely deleted
        assert db.query(models.User).filter(models.User.id == regular_user.id).first() is None

        # Verify group ownership was reassigned to admin_user
        db.refresh(test_grp)
        assert test_grp.created_by == admin_user.id
        reassigned_mem = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == test_grp.id,
            models.GroupMember.user_id == admin_user.id
        ).first()
        assert reassigned_mem.role == "admin"
        print("[PASS] 5. Permanent account deletion succeeded; group ownership transferred to remaining member")

        # 5. Test Audit Logging
        admin_module.log_admin_action(
            db=db,
            admin_user=admin_user,
            action="test_audit_verification",
            target_user_id=disabled_user.id,
            target_identifier=disabled_user.username,
            details="Automated test suite audit verification",
            ip_address="127.0.0.1"
        )
        log_entry = db.query(models.AdminAuditLog).filter(
            models.AdminAuditLog.action == "test_audit_verification"
        ).first()
        assert log_entry is not None
        assert log_entry.target_identifier == disabled_user.username
        print("[PASS] 6. Administrative audit log correctly recorded in database")

        # Clean up test records
        db.delete(test_grp)
        db.delete(admin_user)
        db.delete(disabled_user)
        db.commit()
        print("[PASS] 7. Temporary test fixture records cleanly purged")

        print("==================================================")
        print("ALL ADMIN & ACCOUNT DELETION TESTS PASSED (7/7)")
        print("==================================================")
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
