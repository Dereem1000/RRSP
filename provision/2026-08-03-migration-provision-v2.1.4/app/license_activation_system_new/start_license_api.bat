@echo off
echo Starting Computer Dynamics License API Server...
echo.

REM Set environment variables (LICENSE_RESPONSE_SECRET is loaded from .env by license_api_server.py)
set FLASK_DEBUG=False
set PORT=5001

REM Start the license API server
python license_api_server.py

pause
