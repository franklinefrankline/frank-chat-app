import os
import sys
import traceback
from pathlib import Path

# Resolve directories
api_dir = Path(__file__).resolve().parent
api_backend_us = api_dir / "_backend"
api_backend = api_dir / "backend"
root_dir = api_dir.parent
root_backend = root_dir / "backend"

# Priority search paths for modules
for d in [root_backend, api_backend_us, api_backend, api_dir, root_dir]:
    if d.exists():
        p_str = str(d)
        if p_str in sys.path:
            sys.path.remove(p_str)
        sys.path.insert(0, p_str)

# Signal Vercel environment for temporary SQLite database path
os.environ.setdefault("VERCEL", "1")

app = None
for mod_name in ["backend.main", "_backend.main", "main"]:
    try:
        mod = __import__(mod_name, fromlist=["app"])
        candidate = getattr(mod, "app", None)
        if candidate is not None:
            app = candidate
            break
    except Exception:
        continue

if app is None:
    try:
        from main import app
    except Exception as e:
        from fastapi import FastAPI
        from fastapi.responses import JSONResponse

        app = FastAPI(title="FRANK API - Diagnostic Mode")
        startup_error = str(e)
        startup_trace = traceback.format_exc()

        @app.api_route("/", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
        @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
        async def startup_error_fallback(full_path: str = ""):
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "message": "Backend failed to initialize on Vercel Serverless Function",
                    "error": startup_error,
                    "traceback": startup_trace,
                    "debug": {
                        "sys_path": sys.path,
                        "cwd": os.getcwd(),
                        "api_dir": str(api_dir),
                        "api_backend_exists": api_backend.exists(),
                        "root_backend_exists": root_backend.exists()
                    }
                }
            )
