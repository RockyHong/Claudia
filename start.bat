@echo off
:: Shut down any previous Claudia instance (reads token from ~/.claudia/shutdown-token)
node bin/cli.js shutdown >nul 2>&1
timeout /t 1 /nobreak >nul

echo Installing dependencies...
call npm install
echo Building web UI...
call npm run build
echo Starting Claudia...
:: Launch server minimized — the web dashboard is all you need
start /min "" node bin/cli.js
