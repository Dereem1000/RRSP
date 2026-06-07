@echo off
echo ========================================
echo Law Firm Workstation Monitor Installer
echo ========================================
echo.
echo This installer will set up the Law Firm Workstation Monitor on your computer.
echo.
echo Requirements:
echo - Python 3.8 or higher must be installed and available in PATH
echo - Internet connection for downloading dependencies
echo.
pause

cd /d "%~dp0"

echo.
echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Python is not installed or not in PATH
    echo.
    echo Please install Python 3.8 or higher from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    echo After installing Python, run this installer again.
    pause
    exit /b 1
)

echo Python found!
echo.

echo Installing required packages...
echo This may take a few minutes...
echo.

python -m pip install --upgrade pip
if errorlevel 1 (
    echo ERROR: Failed to upgrade pip
    pause
    exit /b 1
)

python -m pip install requests>=2.31.0 watchdog>=3.0.0 urllib3>=2.0.0 pystray>=0.19.0 plyer>=2.1.0 Pillow>=9.0.0
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install required packages
    echo.
    echo You can try installing them manually:
    echo pip install requests watchdog urllib3 pystray plyer Pillow
    pause
    exit /b 1
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo The Law Firm Workstation Monitor has been installed successfully.
echo.
echo To start the monitor:
echo 1. Double-click "start_workstation.bat" (runs in system tray)
echo 2. Or double-click "start_gui_windowed.bat" (shows console window)
echo.
echo For first-time setup:
echo - Open the application
echo - Go to Configuration tab
echo - Connect to your server using the API key from the web interface
echo.
pause

