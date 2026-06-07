@echo off
cd /d "%~dp0"

rem Node/npm global tools (pm2) are often missing from GUI PATH
if exist "%APPDATA%\npm" set "PATH=%APPDATA%\npm;%PATH%"
if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"

python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed or not in PATH.
    echo Install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

if exist requirements.txt (
    pip install -q -r requirements.txt
)

python run.py
