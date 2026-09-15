import os
import sys
from pathlib import Path

# Add backend directory to sys.path
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

# Signal Vercel environment for temporary SQLite database path if not configured
os.environ.setdefault("VERCEL", "1")

# Import the FastAPI app from backend/main.py
from main import app
