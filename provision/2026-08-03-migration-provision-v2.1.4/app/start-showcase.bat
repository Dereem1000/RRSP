@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "V2_ROOT=%%~fI"
set "SHOWCASE_ROOT=%V2_ROOT%\..\Computer Dynamics System v2 - Showcase"

if exist "%SHOWCASE_ROOT%\data\computer_dynamics.db" (
  set "RUN_ROOT=%SHOWCASE_ROOT%"
) else if exist "%V2_ROOT%\data\computer_dynamics.db" (
  set "RUN_ROOT=%V2_ROOT%"
) else (
  echo  Showcase database not found.
  echo  Run create-showcase-copy.bat first.
  pause
  exit /b 1
)

cd /d "%RUN_ROOT%"

if not exist "%RUN_ROOT%\node_modules" (
  echo  Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo  npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo  Computer Dynamics v2 — SHOWCASE mode
echo  ===================================
echo  Folder:   %RUN_ROOT%
echo  Login:    demo / Demo@2026!
echo  Shares license API + security worker with the main portal (:3000).
echo.

start "Computer Dynamics v2 - Showcase" /D "%RUN_ROOT%" cmd /k "npm run dev:showcase"

echo  Showcase web starting in a new window.
echo  To stop: close that window, or run stop-showcase.bat
echo  Keep the main start.bat window running alongside this one.
echo.
pause
endlocal
