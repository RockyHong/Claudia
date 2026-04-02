@echo off
:: Shut down any previous Claudia instance (reads token from ~/.claudia/shutdown-token)
node bin/cli.js shutdown >nul 2>&1
timeout /t 1 /nobreak >nul

echo Installing dependencies...
call npm install
echo Building web UI...
call npm run build
echo Starting Claudia...
:: Build a temporary shortcut with the Claudia icon, then launch minimized
:: (Windows applies a .lnk's icon to the console window it spawns)
powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut(\"$env:TEMP\claudia.lnk\");$s.TargetPath=(gcm node).Source;$s.Arguments='bin\cli.js';$s.WorkingDirectory='%~dp0.';$s.IconLocation='%~dp0packages\server\assets\icon.ico';$s.WindowStyle=7;$s.Save()"
start "" "%TEMP%\claudia.lnk"
