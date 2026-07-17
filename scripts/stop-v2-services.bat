@echo off
REM Stop portal, Express API, security worker, license API, tunnel, and docked Mini (shared by stop.bat and start-production.bat).
setlocal EnableExtensions

if not defined APP_PORT set "APP_PORT=3000"
if not defined API_PORT set "API_PORT=4000"
if not defined LICENSE_PORT set "LICENSE_PORT=5001"
if not defined MINI_PORT set "MINI_PORT=8876"

echo  Stopping Cloudflare Tunnel...
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Cloudflare Tunnel - Computer Dynamics v2*" /T /F >nul 2>&1

echo  Stopping portal + Express API + security worker + license API...
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Production*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + API + Security + License (Turbopack)*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + API + Security + License*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security + License (Turbopack)*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security + License*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + License*" /T /F >nul 2>&1

echo  Clearing ports %APP_PORT%, %API_PORT%, %LICENSE_PORT%, and %MINI_PORT%...
call "%~dp0clear-port.bat" %APP_PORT%
call "%~dp0clear-port.bat" %API_PORT%
call "%~dp0clear-port.bat" %LICENSE_PORT%
call "%~dp0clear-port.bat" %MINI_PORT%

echo  Stopping docked Mini...
taskkill /FI "WINDOWTITLE eq Mini AI Core*" /T /F >nul 2>&1

timeout /t 2 /nobreak >nul
endlocal
