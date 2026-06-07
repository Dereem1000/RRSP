@echo off
chcp 65001 >nul
cd /d "F:\Computer Dynamics System v2\Management Systems\Document Manager\lawfirm-deployment-20260416_004524 - Demo"
set "PATH=C:\Users\User\AppData\Local\Programs\Python\Python313;C:\Program Files\nodejs;C:\Users\User\AppData\Roaming\npm;C:\Program Files (x86)\Common Files\Oracle\Java\javapath;C:\Program Files (x86)\Common Files\Intel\Shared Libraries\redist\intel64\compiler;C:\Windows\system32;C:\Windows;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0\;C:\Windows\System32\OpenSSH\;C:\Program Files\Git\cmd;C:\php;C:\Program Files\nodejs\;C:\Program Files (x86)\cloudflared\;C:\Program Files\cursor\resources\app\bin;C:\Users\User\AppData\Local\Programs\Python\Python313\Scripts\;C:\Users\User\AppData\Local\Programs\Python\Python313\;C:\Users\User\AppData\Local\Microsoft\WindowsApps;C:\Users\User\AppData\Local\Programs\Ollama;C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe;C:\Users\User\AppData\Local\Programs\Microsoft VS Code\bin;C:\Users\User\AppData\Local\npm;C:\Program Files (x86)\nodejs;%PATH%"
set "PM2=C:\Users\User\AppData\Roaming\npm\pm2.cmd"
echo Using PM2: %PM2%
echo Stopping previous MultiServer PM2 apps for this demo...
call "%PM2%" delete "ms-cabb6ce6-master-vault" "ms-cabb6ce6-zenlaw-server" "ms-cabb6ce6-rotation-scheduler" 2>nul
call "%PM2%" start "F:\Computer Dynamics System v2\Management Systems\Document Manager\lawfirm-deployment-20260416_004524 - Demo\.multiserver\ecosystem.config.js" --only "ms-cabb6ce6-master-vault,ms-cabb6ce6-zenlaw-server"
if errorlevel 1 (
  echo PM2 start failed. Check server dependencies: cd server ^&^& npm install --omit=dev
  call "%PM2%" logs --lines 30
  exit /b 1
)
call "%PM2%" start "F:\Computer Dynamics System v2\Management Systems\Document Manager\lawfirm-deployment-20260416_004524 - Demo\.multiserver\ecosystem.config.js" --only "ms-cabb6ce6-rotation-scheduler" 2>nul
call "%PM2%" status
echo PM2 apps started. Close this window to stop (MultiServer will delete apps on Stop).
:wait
timeout /t 3600 /nobreak >nul
goto wait
