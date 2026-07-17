@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Usage: wait-api-ready.bat [port] [max_seconds] [curl_timeout_seconds]
set "PORT=%~1"
set /a MAX_WAIT=%~2
if "%MAX_WAIT%"=="" set /a MAX_WAIT=300
set /a CURL_TIMEOUT=%~3
if "%CURL_TIMEOUT%"=="" set /a CURL_TIMEOUT=10

if "%PORT%"=="" set "PORT=4000"

set /a WAIT_SEC=0
echo  Waiting for Express API port %PORT% to listen...
:wait_listen
netstat -ano 2>nul | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 goto wait_health
timeout /t 2 /nobreak >nul
set /a WAIT_SEC+=2
if !WAIT_SEC! geq %MAX_WAIT% goto fail
goto wait_listen

:wait_health
echo  Port %PORT% listening — waiting for http://127.0.0.1:%PORT%/api/health/live ...
:wait_health_loop
curl.exe -s -o nul -m !CURL_TIMEOUT! http://127.0.0.1:%PORT%/api/health/live >nul 2>&1
if not errorlevel 1 exit /b 0
timeout /t 4 /nobreak >nul
set /a WAIT_SEC+=4
if !WAIT_SEC! geq %MAX_WAIT% goto fail_slow
goto wait_health_loop

:fail_slow
netstat -ano 2>nul | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  WARNING: Express API is listening on port %PORT% but /api/health/live was slow.
  echo           First startup can take several minutes while handlers load.
  exit /b 0
)
:fail
echo  ERROR: Express API did not start within %MAX_WAIT% seconds on port %PORT%.
exit /b 1
