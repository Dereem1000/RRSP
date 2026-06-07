@echo off
echo ========================================
echo Law Firm Workstation Monitor (Windowed Mode)
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8 or higher
    pause
    exit /b 1
)

echo Python found!
echo.
echo Starting workstation monitor (windowed mode with console)...
echo.
echo Use this mode for debugging or if system tray mode doesn't work.
echo.

python gui_app.py

if errorlevel 1 (
    echo.
    echo ERROR: Failed to start application
    echo Make sure all dependencies are installed:
    echo   pip install -r requirements.txt
    pause
    exit /b 1
)

pause

