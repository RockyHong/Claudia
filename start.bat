@echo off
:: Shut down any previous Claudia instance
curl -sfS -X POST http://127.0.0.1:7890/api/shutdown >nul 2>&1
timeout /t 1 /nobreak >nul

echo Installing dependencies...
call npm install
echo Building web UI...
call npm run build
echo Configuring Claude Code hooks...
node bin/cli.js init --yes
echo Starting Claudia...
:: Minimize this terminal — the web dashboard is all you need
powershell -command "$w=Add-Type -Name W -Namespace N -PassThru -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h,int c);[DllImport(\"kernel32.dll\")] public static extern IntPtr GetConsoleWindow();';$w::ShowWindow($w::GetConsoleWindow(),6)" >nul 2>&1
node bin/cli.js
