@echo off
title FRANK Server - Think
echo ===================================================
echo   FRANK - Think
echo   Starting Local Server on http://localhost:8000
echo ===================================================
echo.

cd /d "%~dp0backend"

if exist "venv\Scripts\activate.bat" (
    echo [INFO] Activating virtual environment...
    call "venv\Scripts\activate.bat"
)

echo [INFO] Starting FastAPI backend on http://localhost:8000...
echo.

:: Wait 2 seconds before opening browser so Uvicorn has bound to port 8000
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8000/login"

python main.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] Default python failed, attempting py launcher...
    py main.py
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Could not start FRANK server. Check error above.
)

pause
