@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title POS System - Local Dev

echo.
echo  POS System - Local Development
echo  ==============================
echo.

if not exist "node_modules" (
    echo  Dependencies missing. Run setup-deployment.bat first.
    pause
    exit /b 1
)

REM Point license validation at the local Flask API (v2 start.bat runs this on :5001)
set LICENSE_SERVER_URL=http://127.0.0.1:5001
set LICENSE_SERVER_FALLBACK_URL=http://127.0.0.1:5001

if not defined PORT set PORT=8000
if not defined NODE_ENV set NODE_ENV=development

echo  Checking license API on port 5001...
netstat -ano | findstr /R /C:":5001 .*LISTENING" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  WARNING: Nothing is listening on port 5001.
    echo  Start the license API first:
    echo    F:\Computer Dynamics System v2\start.bat
    echo.
    echo  Without it, validation falls back to production and may fail with HTTP 530.
    echo.
) else (
    echo  License API detected on port 5001.
)

echo.
echo  POS server:        http://localhost:%PORT%
echo  License server:    %LICENSE_SERVER_URL%
echo.
echo  Press Ctrl+C to stop.
echo.

node server/index.js

if errorlevel 1 pause
endlocal
