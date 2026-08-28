@echo off
setlocal EnableExtensions

echo.
echo  Computer Dynamics v2 - Shutdown
echo  ===============================
echo.

call "%~dp0scripts\stop-v2-services.bat"

echo.
echo  Done.
pause
endlocal
