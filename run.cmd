@echo off
setlocal
cd /d "%~dp0"
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0.tools\browsers"
for /d %%D in ("%~dp0.tools\node-*-win-x64") do set "PATH=%%~fD;%PATH%"
if "%~1"=="" (call npm.cmd run start) else (call npm.cmd run %1)
