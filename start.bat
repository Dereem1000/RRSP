@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0.") do set "V2_ROOT=%%~fI"
set "LICENSE_DIR=%V2_ROOT%\license_activation_system_new"
set "APP_PORT=3000"
set "API_PORT=4000"
set "LICENSE_PORT=5001"
set "MINI_PORT=8876"
set "DOMAIN=computerdynamicstt.com"
set "TUNNEL_CONFIG=%V2_ROOT%\cloudflared-computerdynamics.yml"
set "LOCAL_CLOUDFLARED_EXE=%V2_ROOT%\tools\cloudflared\cloudflared.exe"
set "V1_CLOUDFLARED_EXE=F:\Computer Dynamics System\repair_workspace\repair_C.D_20251004_141630\working\tools\cloudflared\cloudflared.exe"
set "CLOUDFLARED_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe"

cd /d "%V2_ROOT%"
title Computer Dynamics v2

echo.
echo  Computer Dynamics v2 - Portal + Express API + Security Worker + License + Cloudflare
echo  ======================================================================================
echo.

if not exist "%V2_ROOT%\package.json" (
  echo  ERROR: package.json not found.
  pause
  exit /b 1
)

if not exist "%LICENSE_DIR%\license_api_server.py" (
  echo  ERROR: license_api_server.py not found.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js is not in PATH.
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Python is not in PATH.
  pause
  exit /b 1
)

REM Resolve cloudflared (optional — portal still starts if missing)
set "TUNNEL_OK=1"
if exist "%LOCAL_CLOUDFLARED_EXE%" (
  set "CLOUDFLARED_EXE=%LOCAL_CLOUDFLARED_EXE%"
) else if exist "%V1_CLOUDFLARED_EXE%" (
  set "CLOUDFLARED_EXE=%V1_CLOUDFLARED_EXE%"
) else if not exist "%CLOUDFLARED_EXE%" (
  for %%I in (cloudflared.exe) do set "CLOUDFLARED_EXE=%%~$PATH:I"
)
if not exist "%CLOUDFLARED_EXE%" set "TUNNEL_OK=0"
if not exist "%TUNNEL_CONFIG%" set "TUNNEL_OK=0"
findstr /C:"YOUR_TUNNEL" "%TUNNEL_CONFIG%" >nul 2>&1
if not errorlevel 1 set "TUNNEL_OK=0"

echo  Stopping old tunnel and clearing ports %APP_PORT% / %API_PORT% / %LICENSE_PORT%...
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + API + Security + License*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security + License*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + Security*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Computer Dynamics v2 - Portal + License*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Cloudflare Tunnel - Computer Dynamics v2*" /T /F >nul 2>&1
call "%V2_ROOT%\scripts\clear-port.bat" %APP_PORT%
call "%V2_ROOT%\scripts\clear-port.bat" %API_PORT%
call "%V2_ROOT%\scripts\clear-port.bat" %LICENSE_PORT%
timeout /t 2 /nobreak >nul

echo.
echo  Starting portal + Express API + security worker + license API ^(npm run dev:all^)...
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
start "Computer Dynamics v2 - Portal + API + Security + License" /D "%V2_ROOT%" cmd /k "npm run dev:all"

echo  Waiting for Express API http://127.0.0.1:%API_PORT%/api/health ...
call "%V2_ROOT%\scripts\wait-api-ready.bat" %API_PORT% 300 10
if errorlevel 1 (
  pause
  exit /b 1
)
echo  Express API is up on port %API_PORT%.

echo  Waiting for portal http://127.0.0.1:%APP_PORT%/api/health ^(Next proxy^)...
call "%V2_ROOT%\scripts\wait-portal-ready.bat" %APP_PORT% 240 10
if errorlevel 1 (
  pause
  exit /b 1
)
:portal_ready
echo  Portal is up on port %APP_PORT%.

echo  Waiting for security worker heartbeat ^(/api/health^)...
set /a WAIT_SEC=0
:wait_worker
curl.exe -s -m 5 http://127.0.0.1:%APP_PORT%/api/health 2>nul | findstr /C:"\"worker\":\"online\"" >nul 2>&1
if not errorlevel 1 goto worker_ready
curl.exe -s -m 5 http://127.0.0.1:%APP_PORT%/api/health 2>nul | findstr /C:"\"worker\":\"stale\"" >nul 2>&1
if not errorlevel 1 goto worker_ready
curl.exe -s -m 5 http://127.0.0.1:%APP_PORT%/api/health 2>nul | findstr /C:"\"worker\":\"disabled\"" >nul 2>&1
if not errorlevel 1 goto worker_ready
timeout /t 3 /nobreak >nul
set /a WAIT_SEC+=3
if %WAIT_SEC% geq 90 (
  echo  WARNING: Security worker did not report online within 90 seconds.
  echo            Check the dev:all window for [security] errors.
  goto wait_license
)
goto wait_worker
:worker_ready
echo  Security worker is reporting heartbeats.

echo  Waiting for license API http://127.0.0.1:%LICENSE_PORT%/health ...
set /a WAIT_SEC=0
:wait_license
curl.exe -s -o nul -m 3 http://127.0.0.1:%LICENSE_PORT%/health >nul 2>&1
if not errorlevel 1 goto license_ready
timeout /t 2 /nobreak >nul
set /a WAIT_SEC+=2
if %WAIT_SEC% geq 120 (
  echo  ERROR: License API did not start within 120 seconds.
  pause
  exit /b 1
)
goto wait_license
:license_ready
echo  License API is up on port %LICENSE_PORT%.

REM --- Mini (when docked) ---
set "MINI_DOCKED=0"
set "MINI_INSTALL_PATH="
for /f "usebackq delims=" %%L in (`node "%V2_ROOT%\scripts\mini-dock-env.mjs" 2^>nul`) do set "%%L"
if "%MINI_DOCKED%"=="1" if exist "%MINI_INSTALL_PATH%\start_mini_headless.bat" (
  echo.
  echo  Starting docked Mini from %MINI_INSTALL_PATH% ...
  start "Mini AI Core" /D "%MINI_INSTALL_PATH%" cmd /k "start_mini_headless.bat"
  goto wait_mini
)
if "%MINI_DOCKED%"=="1" (
  echo  WARNING: Mini dock configured but start_mini_headless.bat was not found.
)
goto after_mini

:wait_mini
echo  Waiting for Mini http://127.0.0.1:%MINI_PORT%/api/health ...
set /a WAIT_SEC=0
:wait_mini_loop
curl.exe -s -m 5 http://127.0.0.1:%MINI_PORT%/api/health >nul 2>&1
if not errorlevel 1 goto mini_ready
timeout /t 2 /nobreak >nul
set /a WAIT_SEC+=2
if !WAIT_SEC! geq 120 (
  echo  WARNING: Mini did not start within 120 seconds.
  goto after_mini
)
goto wait_mini_loop
:mini_ready
echo  Mini is up on port %MINI_PORT%.
:after_mini

if "%TUNNEL_OK%"=="1" (
  echo.
  echo  Starting Cloudflare Tunnel...
  start "Cloudflare Tunnel - Computer Dynamics v2" "%CLOUDFLARED_EXE%" tunnel --protocol http2 --config "%TUNNEL_CONFIG%" run
  timeout /t 3 /nobreak >nul
) else (
  echo.
  echo  WARNING: Cloudflare tunnel skipped ^(cloudflared or config missing^).
  echo  Local-only mode: http://localhost:%APP_PORT%
)

echo.
echo  ========================================
echo   v2 is running
echo  ========================================
echo    Local portal:  http://localhost:%APP_PORT%
echo    Express API:   http://localhost:%API_PORT%  ^(proxied via portal /api/*^)
echo    License API:   http://localhost:%LICENSE_PORT%
echo    Security:      worker via dev:all ^(Settings - Security for status^)
if "%TUNNEL_OK%"=="1" (
  echo    Public site:   https://www.%DOMAIN%
  echo    License URL:   https://www.%DOMAIN%/api/license/validate
  echo                   https://api.%DOMAIN%/api/license/validate
  echo    Mini URL:      https://mini.%DOMAIN%
)
echo.
echo  KEEP OPEN:
echo    - Computer Dynamics v2 - Portal + API + Security + License
if "%TUNNEL_OK%"=="1" echo    - Cloudflare Tunnel - Computer Dynamics v2
echo.
echo  Stop everything: stop.bat
echo.
pause
endlocal
