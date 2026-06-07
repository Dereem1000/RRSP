@echo off
setlocal
cd /d "%~dp0"

echo.
echo === AutoM server setup ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not on PATH.
  echo Install Node.js 22 LTS ^(64-bit^) from https://nodejs.org/en/download
  echo Do NOT use Node 24 on the server — use the 22 LTS Windows installer.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo Detected: %NODE_VER%
echo Required: Node 22.x LTS ^(same as build — see NODE_VERSION.txt^)
echo.

node -e "const m=parseInt(process.version.slice(1),10); if(m!==22){console.error(''); console.error('ERROR: AutoM requires Node.js 22 LTS on this server.'); console.error('You have Node '+process.version+'.'); console.error(''); console.error('Fix: Install Node 22 LTS from https://nodejs.org/en/download'); console.error('     Choose 22.x LTS Windows Installer ^(.msi^), 64-bit.'); console.error('     Uninstall Node 24 first if both are installed.'); console.error(''); console.error('Rebuild with npm will fail on Node 24 without Visual Studio C++.'); process.exit(1);}"
if errorlevel 1 (
  pause
  exit /b 1
)

if exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
  echo SQLite native module already present for Node 22. No rebuild needed.
  echo.
  echo Setup OK. Run start.bat
  pause
  exit /b 0
)

echo Rebuilding better-sqlite3 for Node 22...
call npm rebuild better-sqlite3
if errorlevel 1 (
  echo.
  echo Rebuild failed. Ensure Node 22 LTS is installed ^(not Node 24^).
  pause
  exit /b 1
)

echo.
echo Setup OK. Run start.bat
echo.
endlocal
