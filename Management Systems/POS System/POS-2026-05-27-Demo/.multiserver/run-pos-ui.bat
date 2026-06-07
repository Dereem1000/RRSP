@echo off
cd /d "F:\Computer Dynamics System v2\Management Systems\POS System\POS-2026-05-27-Demo"
set BROWSER=none
call npx --yes serve@14 -s "F:\Computer Dynamics System v2\Management Systems\POS System\POS-2026-05-27-Demo\client\build" -l 8120
