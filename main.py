"""
FRANK Application Root Launcher
Allows running `python main.py` directly from the project root folder.
"""
import os
import sys
import importlib.util
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

app = None
backend_main_file = backend_dir / "main.py"
if backend_main_file.exists():
    try:
        spec = importlib.util.spec_from_file_location("frank_backend_main", str(backend_main_file))
        if spec and spec.loader:
            backend_mod = importlib.util.module_from_spec(spec)
            sys.modules["frank_backend_main"] = backend_mod
            spec.loader.exec_module(backend_mod)
            app = getattr(backend_mod, "app", None)
    except Exception as e:
        print(f"Backend load note: {e}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"==================================================")
    print(f"Starting FRANK backend on http://127.0.0.1:{port}")
    print(f"Frontend available at: http://127.0.0.1:{port}/login.html")
    print(f"==================================================")
    uvicorn.run("main:app", host=host, port=port, reload=False, app_dir=str(backend_dir))
