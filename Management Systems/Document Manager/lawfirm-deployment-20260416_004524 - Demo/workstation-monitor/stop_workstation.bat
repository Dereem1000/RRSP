@echo off
REM Batch script to stop workstation monitor applications
REM This script only stops workstation monitor processes, leaving other Python apps running

echo Stopping Workstation Monitor applications...

REM Use PowerShell script for more reliable process detection
powershell.exe -ExecutionPolicy Bypass -File "%~dp0stop_workstation.ps1"

pause
