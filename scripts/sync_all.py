import os
import shutil
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent

html_files = [
    "index.html", "login.html", "register.html", "dashboard.html",
    "settings.html", "profile.html", "admin.html",
    "forgot-password.html", "reset-password.html", "chat.html", "404.html"
]

target_frontend_dirs = [
    root_dir / "frontend",
    root_dir / "backend" / "frontend",
    root_dir / "api" / "_backend" / "frontend"
]

def sync_assets():
    print("Syncing assets and frontend...")
    for target in target_frontend_dirs:
        target.mkdir(parents=True, exist_ok=True)

        # Copy HTML files
        for html_file in html_files:
            src = root_dir / html_file
            if src.exists():
                shutil.copy2(src, target / html_file)

        # Copy directories: css, js, assets
        for d in ["css", "js", "assets"]:
            src_d = root_dir / d
            dst_d = target / d
            if src_d.exists():
                if dst_d.exists():
                    shutil.rmtree(dst_d)
                shutil.copytree(src_d, dst_d)

    # Sync backend files to api/_backend
    api_backend = root_dir / "api" / "_backend"
    if api_backend.exists():
        for b_item in ["models.py", "schemas.py", "database.py", "security.py", "main.py"]:
            src_b = root_dir / "backend" / b_item
            if src_b.exists():
                shutil.copy2(src_b, api_backend / b_item)
        for r_dir in ["routes", "websocket"]:
            src_r = root_dir / "backend" / r_dir
            dst_r = api_backend / r_dir
            if src_r.exists():
                if dst_r.exists():
                    shutil.rmtree(dst_r)
                shutil.copytree(src_r, dst_r)

    print("Sync complete!")

if __name__ == "__main__":
    sync_assets()
