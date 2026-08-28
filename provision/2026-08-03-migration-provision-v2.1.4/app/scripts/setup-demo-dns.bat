@echo off
setlocal EnableExtensions

echo.
echo  Computer Dynamics — register demo.computerdynamicstt.com DNS for tunnel
echo  =======================================================================
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo  ERROR: cloudflared not in PATH.
  pause
  exit /b 1
)

set "TUNNEL_ID=cdcb0769-874b-4923-aeed-a493e1a2b6af"
set "DEMO_HOST=demo.computerdynamicstt.com"

echo  Registering DNS route (CNAME to tunnel)...
cloudflared tunnel route dns %TUNNEL_ID% %DEMO_HOST%
if errorlevel 1 (
  echo.
  echo  If this failed, add manually in Cloudflare:
  echo    DNS -^> Add record -^> CNAME
  echo    Name: demo
  echo    Target: %TUNNEL_ID%.cfargotunnel.com
  echo    Proxy: Proxied (orange cloud)
  pause
  exit /b 1
)

echo.
echo  Flushing local DNS cache...
ipconfig /flushdns >nul

echo.
echo  Checking public DNS (1.1.1.1)...
nslookup %DEMO_HOST% 1.1.1.1

echo.
echo  Next steps:
echo    1. Confirm cloudflared-computerdynamics.yml has demo -^> :3001 ingress
echo    2. Restart tunnel (stop.bat then start.bat)
echo    3. Run start-showcase.bat in the showcase folder
echo    4. Open https://demo.computerdynamicstt.com/login
echo.
pause
endlocal
