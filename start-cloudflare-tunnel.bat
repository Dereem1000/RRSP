@echo off
REM Start only the Cloudflare tunnel (portal + license API must already be running).
call "%~dp0scripts\restart-cloudflared-tunnel.bat"
exit /b %ERRORLEVEL%
