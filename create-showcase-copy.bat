@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "V2_ROOT=%%~fI"
cd /d "%V2_ROOT%"

where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js is not in PATH.
  pause
  exit /b 1
)

echo.
echo  Computer Dynamics v2 — Create Showcase Copy
echo  ===========================================
echo  Source: %V2_ROOT%
echo  Target: %V2_ROOT%\..\Computer Dynamics System v2 - Showcase
echo.

node scripts\export-showcase-schema.mjs
if errorlevel 1 goto failed

node scripts\create-showcase-copy.mjs
if errorlevel 1 goto failed

echo  Done.
pause
exit /b 0

:failed
echo.
echo  Showcase copy failed. See errors above.
pause
exit /b 1
