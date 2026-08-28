@echo off
setlocal EnableExtensions

echo  Stopping Cloudflare Tunnel...
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Cloudflare Tunnel - Computer Dynamics v2*" /T /F >nul 2>&1

echo  Done.
exit /b 0
