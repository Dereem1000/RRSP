@echo off
echo Starting POS System...
echo.

if not exist "node_modules" (
    echo Dependencies not installed. Run setup-deployment.bat first.
    pause
    exit /b 1
)

set NODE_ENV=production
if not defined PORT set PORT=8000
if not defined ALLOWED_ORIGINS set ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
if not defined LICENSE_SERVER_URL set LICENSE_SERVER_URL=https://api.computerdynamicstt.com

echo Server: http://localhost:%PORT%
echo.
node server/index.js
pause
