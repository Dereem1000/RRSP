@echo off
echo ========================================
echo Law Firm Workstation Monitor (GUI)
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8 or higher from https://python.org
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

echo Python found!
echo.

echo Checking for required dependencies...
python -c "import tkinter, requests, watchdog, pystray, plyer, PIL" >nul 2>&1
if errorlevel 1 (
    echo WARNING: Some dependencies may be missing
    echo Installing/updating dependencies...
    echo.
    pip install --quiet requests watchdog pystray plyer Pillow
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        echo Please run: pip install requests watchdog pystray plyer Pillow
        pause
        exit /b 1
    )
)

echo Dependencies OK!
echo.

echo Starting workstation monitor GUI...
echo.
echo The application will appear as an icon in the system tray.
echo Right-click the tray icon to access the menu and open the main window.
echo.
echo If the GUI doesn't appear, check the system tray (bottom-right corner).
echo.

REM Use pythonw to run GUI without console window
pythonw gui_app.py

REM Check if the application started successfully
timeout /t 3 /nobreak >nul
tasklist /fi "imagename eq pythonw.exe" | find "pythonw.exe" >nul
if errorlevel 1 (
    echo.
    echo WARNING: GUI application may not have started properly
    echo Try running: python gui_app.py (to see error messages)
    echo.
    echo If pythonw is not found, install Python with the launcher option
    echo or run: python gui_app.py
    pause
) else (
    echo.
    echo SUCCESS: GUI application started!
    echo Check the system tray for the workstation monitor icon.
    echo.
)

