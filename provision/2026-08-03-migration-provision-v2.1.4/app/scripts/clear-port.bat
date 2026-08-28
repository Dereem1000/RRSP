@echo off
REM Usage: clear-port.bat <port>
setlocal EnableExtensions
set "PORT=%~1"
if "%PORT%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0clear-port.ps1" -Port %PORT%
endlocal
