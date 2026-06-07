@echo off
chcp 65001 >nul
cd /d "F:\Computer Dynamics System v2\Management Systems\Restaurant System\restaurant-deployment-20260422_094910"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set PORT=8110
set MULTISERVER_SCRIPT_NAME=/demo/repair-restaurant
if not exist .env (
  if exist setup_secrets.py (
    echo [MultiServer] No .env found — running setup_secrets.py...
    call python setup_secrets.py
    if errorlevel 1 exit /b 1
  )
)
set FLASK_APP=.multiserver\entry
set DEV_MODE=1
set FLASK_ENV=development
set BROWSER=none
call python -X utf8 -m flask run --host 0.0.0.0 --port 8110 --no-reload
if errorlevel 1 (
  echo Flask CLI failed, trying entry.py fallback>>"%TEMP%\multiserver-flask.log"
  call python -X utf8 .multiserver\entry.py
)
