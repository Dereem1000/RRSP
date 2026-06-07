@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "VERSION=1.1.0"
set "BUILD_ID=20260531"

echo.
echo ============================================================
echo   MultiServer Update Package v%VERSION%  (%BUILD_ID%)
echo ============================================================
echo.
echo This updates an EXISTING MultiServer install.
echo Preserved on target (never overwritten by payload):
echo   config.json, demos-manifest.json, demo-pages.json, DISTRIBUTION-MANIFEST.json, Caddyfile; logs, .git, distributions, __pycache__, .venv, venv, .cursor, .vscode
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
echo.

if exist "%TARGET%\config.json" (
    for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set "STAMP=%%c%%a%%b"
    set "BACKUP=%TARGET%\config.json.bak-%STAMP%"
    copy /y "%TARGET%\config.json" "%BACKUP%" >nul
    echo Backed up config.json to:
    echo   %BACKUP%
    echo.
)

echo Copying updated application files...
robocopy "%~dp0payload" "%TARGET%" /E /NFL /NDL /NJH /NJS /NC /NS /NP ^
    /XF config.json demos-manifest.json demo-pages.json DISTRIBUTION-MANIFEST.json Caddyfile config.json.bak* *.log ^
    /XD logs .git distributions __pycache__ .venv venv .cursor .vscode >nul
if errorlevel 8 (
    echo Robocopy failed with error %errorlevel%.
    pause
    exit /b 1
)

echo.
echo Migrating config.json (adds new settings fields if missing; never replaces existing values)...
python --version >nul 2>&1
if errorlevel 1 (
    echo Python not found - skip config migration. Run manually:
    echo   python "%TARGET%\scripts\migrate_config.py" "%TARGET%\config.json"
) else (
    python "%TARGET%\scripts\migrate_config.py" "%TARGET%\config.json"
    if errorlevel 1 (
        echo Config migration failed.
        pause
        exit /b 1
    )
)

if exist "%TARGET%\requirements.txt" (
    echo.
    echo Updating Python dependencies...
    pip install -q -r "%TARGET%\requirements.txt"
)

echo.
echo ============================================================
echo   Update complete - MultiServer v%VERSION%
echo ============================================================
echo.
echo 1. Close MultiServer if it is running.
echo 2. Start MultiServer from: %TARGET%\launch.bat
echo 3. If you use Caddy, regenerate deploy\Caddyfile from your config:
echo      cd /d "%TARGET%\deploy"
echo      powershell -ExecutionPolicy Bypass -File install-caddy.ps1
echo.
pause
endlocal

