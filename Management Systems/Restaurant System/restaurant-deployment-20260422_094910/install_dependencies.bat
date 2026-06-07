@echo off
echo Installing required Python dependencies for Database Server GUI...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python first and try again
    pause
    exit /b 1
)

echo Installing requests module...
pip install requests

if errorlevel 1 (
    echo.
    echo ERROR: Failed to install requests module
    echo Please try running: pip install requests
    pause
    exit /b 1
)

echo.
echo Installing Flask module...
pip install flask

if errorlevel 1 (
    echo.
    echo WARNING: Failed to install Flask module
    echo You may need to install it manually: pip install flask
)

echo.
echo Installing Werkzeug module...
pip install werkzeug

if errorlevel 1 (
    echo.
    echo WARNING: Failed to install Werkzeug module
    echo You may need to install it manually: pip install werkzeug
)

echo.
echo Installing pystray for system tray functionality...
pip install pystray

if errorlevel 1 (
    echo.
    echo WARNING: Failed to install pystray module
    echo You may need to install it manually: pip install pystray
)

echo.
echo Installing Pillow for image processing...
pip install Pillow

if errorlevel 1 (
    echo.
    echo WARNING: Failed to install Pillow module
    echo You may need to install it manually: pip install Pillow
)

echo.
echo Dependencies installation completed!
echo You can now run the Database Server GUI with system tray support.
echo.
pause
