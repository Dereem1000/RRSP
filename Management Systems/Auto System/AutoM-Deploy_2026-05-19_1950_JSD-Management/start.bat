@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.local" (
  echo ERROR: Copy .env.example to .env.local and set values from Computer Dynamics.
  pause
  exit /b 1
)

if not exist "data\users.db" (
  echo ERROR: Database files missing under .\data\
  echo Contact Computer Dynamics for a complete distribution package.
  pause
  exit /b 1
)

set NODE_ENV=production
title AutoM Production
echo Starting AutoM (production) on http://localhost:6001
echo Use your configured public URL in the browser for login.
echo.
call npm run start
endlocal
