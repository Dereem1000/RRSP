@echo off
REM Stop only the Cloudflare tunnel (portal + license API keep running).
call "%~dp0scripts\stop-cloudflared-tunnel.bat"
exit /b %ERRORLEVEL%
