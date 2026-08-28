@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Usage: wait-portal-ready.bat <port> [max_seconds] [curl_timeout_seconds]
set "PORT=%~1"
set /a MAX_WAIT=%~2
if "%MAX_WAIT%"=="" set /a MAX_WAIT=360
set /a CURL_TIMEOUT=%~3
if "%CURL_TIMEOUT%"=="" set /a CURL_TIMEOUT=15

if "%PORT%"=="" (
  echo  ERROR: wait-portal-ready.bat requires a port number.
  exit /b 1
)

set /a WAIT_SEC=0
echo  Waiting for portal port %PORT% to listen...
:wait_listen
netstat -ano 2>nul | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 goto wait_health
timeout /t 2 /nobreak >nul
set /a WAIT_SEC+=2
if !WAIT_SEC! geq %MAX_WAIT% goto fail_or_warn
goto wait_listen

:wait_health
echo  Port %PORT% listening — waiting for http://127.0.0.1:%PORT%/api/health/live ...
:wait_health_loop
curl.exe -s -o nul -m !CURL_TIMEOUT! http://127.0.0.1:%PORT%/api/health/live >nul 2>&1
if not errorlevel 1 exit /b 0
timeout /t 4 /nobreak >nul
set /a WAIT_SEC+=4
if !WAIT_SEC! geq %MAX_WAIT% goto fail_or_warn
goto wait_health_loop

:fail_or_warn
netstat -ano 2>nul | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  WARNING: Portal is listening on port %PORT% but /api/health/live was slow to respond.
  echo           Common on first Turbopack compile — continuing startup.
  exit /b 0
)
echo  ERROR: Portal did not start within %MAX_WAIT% seconds.
exit /b 1
