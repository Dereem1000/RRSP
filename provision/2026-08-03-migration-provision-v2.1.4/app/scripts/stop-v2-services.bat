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

echo  Stopping portal + Express API + security worker + license API windows...
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Production*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + API + Security + License (Turbopack)*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + API + Security + License*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security + License (Turbopack)*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security + License*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + License*" /T /F >nul 2>&1

REM Kill concurrently supervisors first — otherwise --restart-tries respawns Next/Express
REM immediately after clear-port and leaves :3000/:4000 busy for the next start.
echo  Stopping concurrently supervisors (prevents port respawn)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$patterns = @('start:production:runtime','start:production','concurrently.*web,api,security,license','concurrently.*api,web,security,license');" ^
  "Get-CimInstance Win32_Process | ForEach-Object {" ^
  "  $cmd = $_.CommandLine; if (-not $cmd) { return };" ^
  "  if ($_.Name -notmatch '^(node|cmd)\.exe$') { return };" ^
  "  $hit = $false; foreach ($p in $patterns) { if ($cmd -match $p) { $hit = $true; break } };" ^
  "  if (-not $hit) { return };" ^
  "  Write-Host ('  Stopping PID ' + $_.ProcessId);" ^
  "  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue" ^
  "}"

echo  Clearing ports %APP_PORT%, %API_PORT%, %LICENSE_PORT%, and %MINI_PORT%...
call "%~dp0clear-port.bat" %APP_PORT%
call "%~dp0clear-port.bat" %API_PORT%
call "%~dp0clear-port.bat" %LICENSE_PORT%
call "%~dp0clear-port.bat" %MINI_PORT%

REM Second pass after a brief pause (TIME_WAIT / slow child exit)
ping -n 3 127.0.0.1 >nul
call "%~dp0clear-port.bat" %APP_PORT%
call "%~dp0clear-port.bat" %API_PORT%
call "%~dp0clear-port.bat" %LICENSE_PORT%
call "%~dp0clear-port.bat" %MINI_PORT%

echo  Stopping docked Mini...
taskkill /FI "WINDOWTITLE eq Mini AI Core*" /T /F >nul 2>&1

ping -n 3 127.0.0.1 >nul

netstat -ano 2>nul | findstr LISTENING | findstr ":%APP_PORT% :%API_PORT% :%LICENSE_PORT%" >nul 2>&1
if not errorlevel 1 (
  echo  WARNING: A listener is still present on %APP_PORT%/%API_PORT%/%LICENSE_PORT%.
  echo           Run stop.bat again, or: scripts\clear-port.bat %APP_PORT% ^& scripts\clear-port.bat %API_PORT%
) else (
  echo  Ports %APP_PORT%, %API_PORT%, %LICENSE_PORT% are free.
)

endlocal
