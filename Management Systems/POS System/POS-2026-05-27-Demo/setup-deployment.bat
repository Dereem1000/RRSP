@echo off
echo ========================================
echo    POS System - Client Setup
echo ========================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is required. Install from https://nodejs.org/
    pause
    exit /b 1
)

echo Installing production dependencies...
call npm install --omit=dev
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

if not exist "client\build\index.html" (
    echo ERROR: Application build is missing. Contact your POS provider.
    pause
    exit /b 1
)

echo.
echo Setup complete. Run start-production.bat to launch.
pause
