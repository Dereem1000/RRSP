@echo off

setlocal EnableExtensions



for %%I in ("%~dp0.") do set "V2_ROOT=%%~fI"

set "SHOWCASE_ROOT=%V2_ROOT%\..\Computer Dynamics System v2 - Showcase"



if exist "%SHOWCASE_ROOT%\scripts\stop-showcase.mjs" (

  set "RUN_ROOT=%SHOWCASE_ROOT%"

) else (

  set "RUN_ROOT=%V2_ROOT%"

)



cd /d "%RUN_ROOT%"

node scripts/stop-showcase.mjs

echo.

pause

endlocal

