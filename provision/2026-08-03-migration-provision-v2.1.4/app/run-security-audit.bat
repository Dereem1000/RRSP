@echo off

setlocal

cd /d "%~dp0"

echo.

echo  Computer Dynamics v2 - Full Security Review (2 steps)

echo  =====================================================

echo  Step 1: Config audit    Step 2: Production pentest

echo.

call npm run audit:security:full %*

set EXITCODE=%ERRORLEVEL%

echo.

if %EXITCODE% NEQ 0 (

  echo  Review failed. See:

  echo    data\security-audit-reports\latest.md

  echo    data\security-audit-reports\latest-pentest.md

) else (

  echo  Full review passed. Reports in data\security-audit-reports\

)

exit /b %EXITCODE%

