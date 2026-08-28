@echo off
setlocal EnableExtensions
if "%~1"=="" (
  echo Usage: install-migration-provision.bat ^<InstallRoot^> ^<PackageRoot^>
  echo Example: install-migration-provision.bat "D:\Apps\ComputerDynamicsV2" "%~dp0"
  exit /b 1
)
if "%~2"=="" (
  echo Usage: install-migration-provision.bat ^<InstallRoot^> ^<PackageRoot^>
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-migration-provision.ps1" -InstallRoot "%~1" -PackageRoot "%~2"
endlocal
