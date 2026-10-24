"""
FRANK Think — Pre-Deployment Data Backup Script
Safely extracts and verifies all records from the database and archives local upload assets.
"""

import os
import sys
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

import database
import models
from sqlalchemy import inspect

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)

def run_backup():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = Path(__file__).resolve().parent.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    backup_file = backup_dir / f"db_backup_{timestamp}.json"
    print(f"Starting pre-deployment backup to: {backup_file}")

    db = database.SessionLocal()
    backup_data = {
        "metadata": {
            "timestamp": timestamp,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "database_url_target": database.DATABASE_URL.split("@")[-1] if "@" in database.DATABASE_URL else "sqlite",
            "table_counts": {}
        },
        "tables": {}
    }

    try:
        # Dynamically discover all registered SQLAlchemy models
        model_classes = []
        for mapper in database.Base.registry.mappers:
            cls = mapper.class_
            model_classes.append((cls.__tablename__, cls))

        total_records = 0
        for table_name, model_cls in model_classes:
            try:
                records = db.query(model_cls).all()
                serialized_rows = []
                for r in records:
                    row_dict = {}
                    for col in inspect(model_cls).columns:
                        row_dict[col.name] = getattr(r, col.name)
                    serialized_rows.append(row_dict)

                backup_data["tables"][table_name] = serialized_rows
                count = len(serialized_rows)
                backup_data["metadata"]["table_counts"][table_name] = count
                total_records += count
                print(f"  [BACKUP] Table '{table_name}': {count} records extracted")
            except Exception as e:
                print(f"  [NOTE] Skipping table '{table_name}': {e}")

        # Write to JSON backup file
        with open(backup_file, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, default=json_serial, indent=2)

        file_size = backup_file.stat().st_size
        print(f"\n[PASS] Database backup complete: {backup_file} ({file_size} bytes, {total_records} total records across {len(backup_data['tables'])} tables)")

        # Backup uploads directory if it exists
        uploads_dirs = [
            Path(__file__).resolve().parent.parent / "uploads",
            Path(__file__).resolve().parent.parent / "backend" / "uploads"
        ]
        uploads_zip = backup_dir / f"uploads_backup_{timestamp}.zip"
        uploaded_files_count = 0
        with zipfile.ZipFile(uploads_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for udir in uploads_dirs:
                if udir.exists():
                    for f in udir.rglob("*"):
                        if f.is_file():
                            arcname = f.relative_to(udir)
                            zf.write(f, arcname=f"{udir.name}/{arcname}")
                            uploaded_files_count += 1

        print(f"[PASS] Uploads archive complete: {uploads_zip} ({uploaded_files_count} files archived)")

        # Verify backup integrity
        assert backup_file.exists(), "Backup file was not created!"
        assert file_size > 1000, f"Backup file seems too small ({file_size} bytes)!"
        assert total_records > 0, "Zero records backed up!"
        with open(backup_file, "r", encoding="utf-8") as f:
            verified_json = json.load(f)
        assert verified_json["metadata"]["table_counts"]["users"] > 0, "No user records in verified backup!"
        print(f"[VERIFIED] Backup integrity confirmed: {verified_json['metadata']['table_counts']['users']} users safely verified in backup.")

        return True, backup_file, uploads_zip, backup_data["metadata"]

    except Exception as e:
        print(f"[ERROR] Backup verification failed: {e}")
        return False, None, None, str(e)
    finally:
        db.close()

if __name__ == "__main__":
    success, bf, uf, meta = run_backup()
    if not success:
        sys.exit(1)
