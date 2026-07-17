@echo off
setlocal EnableExtensions

REM Restart only cloudflared (portal, license API, and docked Mini on :8876 stay up). Used by Developer Toolbox Apply.
for %%I in ("%~dp0..") do set "V2_ROOT=%%~fI"
set "TUNNEL_CONFIG=%V2_ROOT%\cloudflared-computerdynamics.yml"
set "LOCAL_CLOUDFLARED_EXE=%V2_ROOT%\tools\cloudflared\cloudflared.exe"
set "V1_CLOUDFLARED_EXE=F:\Computer Dynamics System\repair_workspace\repair_C.D_20251004_141630\working\tools\cloudflared\cloudflared.exe"
set "CLOUDFLARED_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe"

if defined CD_TUNNEL_CONFIG if exist "%CD_TUNNEL_CONFIG%" set "TUNNEL_CONFIG=%CD_TUNNEL_CONFIG%"
if defined CD_CLOUDFLARED_EXE if exist "%CD_CLOUDFLARED_EXE%" set "CLOUDFLARED_EXE=%CD_CLOUDFLARED_EXE%"

if not defined CD_CLOUDFLARED_EXE (
  if exist "%LOCAL_CLOUDFLARED_EXE%" (
    set "CLOUDFLARED_EXE=%LOCAL_CLOUDFLARED_EXE%"
  ) else if exist "%V1_CLOUDFLARED_EXE%" (
    set "CLOUDFLARED_EXE=%V1_CLOUDFLARED_EXE%"
  ) else if not exist "%CLOUDFLARED_EXE%" (
    for %%I in (cloudflared.exe) do set "CLOUDFLARED_EXE=%%~$PATH:I"
  )
)

if not exist "%CLOUDFLARED_EXE%" (
  echo ERROR: cloudflared.exe not found
  exit /b 1
)
if not exist "%TUNNEL_CONFIG%" (
  echo ERROR: Tunnel config not found: %TUNNEL_CONFIG%
  exit /b 1
)

taskkill /IM cloudflared.exe /F >nul 2>&1
ping -n 3 127.0.0.1 >nul
start "Cloudflare Tunnel - Computer Dynamics v2" "%CLOUDFLARED_EXE%" tunnel --protocol http2 --config "%TUNNEL_CONFIG%" run
exit /b 0
