@echo off
setlocal EnableExtensions

set "APP_PORT=3000"
set "LICENSE_PORT=5001"

echo.
echo  Computer Dynamics v2 - Shutdown
echo  ===============================
echo.

echo  Stopping Cloudflare Tunnel...
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Cloudflare Tunnel - Computer Dynamics v2*" /T /F >nul 2>&1

echo  Stopping portal + security worker + license API...
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + License*" /T /F >nul 2>&1

echo  Clearing ports %APP_PORT% and %LICENSE_PORT%...
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
  if not "%%A"=="0" taskkill /PID %%A /T /F >nul 2>&1
)
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%LICENSE_PORT% .*LISTENING"') do (
  if not "%%A"=="0" taskkill /PID %%A /T /F >nul 2>&1
)

echo.
echo  Done.
pause
endlocal
