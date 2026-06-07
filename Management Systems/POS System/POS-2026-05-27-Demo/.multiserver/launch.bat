@echo off
cd /d "F:\Computer Dynamics System v2\Management Systems\POS System\POS-2026-05-27-Demo"
start "pos-api" /MIN cmd /c "F:\Computer Dynamics System v2\Management Systems\POS System\POS-2026-05-27-Demo\.multiserver\run-pos-api.bat"
start "pos-ui" /MIN cmd /c "F:\Computer Dynamics System v2\Management Systems\POS System\POS-2026-05-27-Demo\.multiserver\run-pos-ui.bat"
echo POS demo: UI :8120  API :8121
:wait
ping 127.0.0.1 -n 3601 >nul
goto wait
