"""
FRANK Application Root Launcher
Allows running `python main.py` directly from the project root folder.
"""
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    import main as backend_main
    app = getattr(backend_main, "app", None)
except Exception:
    try:
        from backend.main import app
    except Exception:
        app = None

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"==================================================")
    print(f"Starting FRANK backend on http://127.0.0.1:{port}")
    print(f"Frontend available at: http://127.0.0.1:{port}/login.html")
    print(f"==================================================")
    uvicorn.run("main:app", host=host, port=port, reload=False, app_dir=str(backend_dir))
