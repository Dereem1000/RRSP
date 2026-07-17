@echo off
REM Usage: clear-port.bat <port>
setlocal EnableExtensions
set "PORT=%~1"
if "%PORT%"=="" exit /b 1
for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%A"=="0" taskkill /PID %%A /T /F >nul 2>&1
)
endlocal
