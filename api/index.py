import os
import sys
import traceback
import importlib.util
from pathlib import Path

# Signal Vercel environment
os.environ.setdefault("VERCEL", "1")

api_dir = Path(__file__).resolve().parent
root_dir = api_dir.parent

candidates = [
    api_dir / "_backend" / "main.py",
    api_dir / "backend" / "main.py",
    root_dir / "backend" / "main.py",
]

app = None
last_err = None
last_trace = ""

for candidate in candidates:
    if candidate.exists():
        cand_dir = candidate.parent
        p_str = str(cand_dir)
        if p_str in sys.path:
            sys.path.remove(p_str)
        sys.path.insert(0, p_str)
        try:
            spec = importlib.util.spec_from_file_location("frank_serverless_backend", str(candidate))
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                sys.modules["frank_serverless_backend"] = mod
                spec.loader.exec_module(mod)
                candidate_app = getattr(mod, "app", None)
                if candidate_app is not None:
                    app = candidate_app
                    break
        except Exception as e:
            last_err = e
            last_trace = traceback.format_exc()
            continue

if app is None:
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    app = FastAPI(title="FRANK API - Diagnostic Mode")
    startup_error = str(last_err) if last_err else "Backend main.py not found in candidate paths"

    @app.api_route("/health", methods=["GET", "HEAD"])
    @app.api_route("/api/health", methods=["GET", "HEAD"])
    def diagnostic_health():
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "database": "disconnected"
            }
        )

    @app.api_route("/", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
    async def startup_error_fallback(full_path: str = ""):
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Backend failed to initialize on Vercel Serverless Function",
                "error": startup_error,
                "traceback": last_trace,
                "debug": {
                    "sys_path": sys.path,
                    "cwd": os.getcwd(),
                    "api_dir": str(api_dir),
                    "candidates_exist": [str(c) for c in candidates if c.exists()]
                }
            }
        )
