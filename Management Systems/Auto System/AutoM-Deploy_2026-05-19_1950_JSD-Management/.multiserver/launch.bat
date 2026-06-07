@echo off
cd /d "E:\AutoM.System\distributions\AutoM-Deploy_2026-05-19_1950_JSD-Management"
set PORT=8110
set NODE_ENV=production
set BROWSER=none
if not exist .env.local if exist .env.example copy /Y .env.example .env.local >nul
call npm run start -- -p 8110
