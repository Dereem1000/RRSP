@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "VERSION={{VERSION}}"
set "BUILD_ID={{BUILD_ID}}"

echo.
echo ============================================================
echo   MultiServer Update Package v%VERSION%  (%BUILD_ID%)
echo ============================================================
echo.
echo This updates an EXISTING MultiServer install.
echo Preserved on target (never overwritten by payload):
echo   {{PRESERVE_LIST}}
echo.
echo After update, regenerate deploy\Caddyfile from YOUR config:
echo   powershell -File deploy\install-caddy.ps1
echo.

set "TARGET=%~1"
if "%TARGET%"=="" (
    set /p "TARGET=Enter path to your MultiServer folder (e.g. E:\MultiServer): "
)
if "%TARGET%"=="" (
    echo No target folder specified.
    pause
    exit /b 1
)

if not exist "%TARGET%\config.json" (
    echo.
    echo WARNING: %TARGET%\config.json not found.
    echo This package is for updating an existing install, not first-time setup.
    set /p "CONTINUE=Continue anyway? [y/N]: "
    if /i not "%CONTINUE%"=="y" exit /b 1
)

echo.
echo Target: %TARGET%
if exist "%TARGET%\config.json" (
    set "STAMP=%DATE:~-4%%DATE:~4,2%%DATE:~7,2%-%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
    set "STAMP=%STAMP: =0%"
    copy /Y "%TARGET%\config.json" "%TARGET%\config.json.bak-%STAMP%" >nul
    echo Backed up config.json
)

echo Copying payload...
robocopy "%~dp0payload" "%TARGET%" /E /NFL /NDL /NJH /NJS /nc /ns /np /XF {{ROBOCOPY_XF}} /XD {{ROBOCOPY_XD}}
if errorlevel 8 (
    echo Robocopy failed.
    pause
    exit /b 1
)

echo.
echo Update to v%VERSION% complete. Start with launch.bat
pause
