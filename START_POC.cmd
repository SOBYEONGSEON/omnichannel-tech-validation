@echo off
setlocal
cd /d "%~dp0"
for /d %%D in ("%~dp0.tools\node-*-win-x64") do set "PATH=%%~fD;%PATH%"
echo Starting local analysis. Close this window or press Ctrl+C to stop.
echo Open http://127.0.0.1:8787/live in Chrome.
echo Pairing token is in artifacts\server-token.txt after server startup.
call npm.cmd run start
