@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   Restaurant System -- Production Startup
echo ============================================================
echo.

REM ── Pre-flight 1: .env must exist ────────────────────────────────────────────
if not exist ".env" (
    echo [FATAL] .env file not found.
    echo.
    echo  This file holds the SECRET_KEY and other per-installation
    echo  settings. It is never included in the source package.
    echo.
    echo  Run setup to generate it:
    echo    python setup_secrets.py
    echo.
    pause
    exit /b 1
)
echo [OK] .env found

REM ── Pre-flight 2: Python must be available ────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [FATAL] Python not found in PATH.
    echo  Install Python 3.9+ and re-run this script.
    echo.
    pause
    exit /b 1
)
echo [OK] Python available

REM ── Pre-flight 3: SECRET_KEY must not be the template placeholder ─────────────
python _validate_env.py
if errorlevel 1 (
    echo.
    pause
    exit /b 1
)

REM ── Pre-flight 4: Install / verify Python dependencies ───────────────────────
if exist "requirements.txt" (
    echo [INFO] Installing dependencies from requirements.txt...
    pip install -r requirements.txt --quiet
    if errorlevel 1 (
        echo [FATAL] Failed to install dependencies.
        echo         Run manually:  pip install -r requirements.txt
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [WARN] requirements.txt not found, skipping dependency install
)

REM ── Read HOST and PORT from .env (with safe defaults) ────────────────────────
set HOST=0.0.0.0
set PORT=5000
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "_line=%%A"
    if "!_line:~0,1!" neq "#" (
        if "%%A"=="HOST" set HOST=%%B
        if "%%A"=="PORT" set PORT=%%B
    )
)

echo.
echo ============================================================
echo   Starting server on http://%HOST%:%PORT%
echo   License registration: http://%HOST%:%PORT%/register
echo   Press Ctrl+C to stop.
echo ============================================================
echo.

REM ── Start with Waitress ───────────────────────────────────────────────────────
python _launch_server.py

if errorlevel 1 (
    echo.
    echo [ERROR] Server exited with an error. Check the output above.
    echo.
)

pause
