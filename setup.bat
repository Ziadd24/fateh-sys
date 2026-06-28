@echo off
title Vet Monitor - First Time Setup

:: Always run from the script's own folder, regardless of where it was launched from
cd /d "%~dp0"

echo ===================================================
echo Vet Monitor - Offline Installation Helper
echo ===================================================
echo.
echo This script will help you install Node.js (required to run the system offline)
echo and create a desktop shortcut for easy access.
echo.

:: 1. Check if Node.js is already installed
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Node.js is already installed!
    echo.
    goto create_shortcut
)

:: 2. Download Node.js Installer
echo [INFO] Downloading the official Node.js installer...
echo Please wait, this might take a minute depending on your internet speed...
echo.

:: Use PowerShell to download the official Node.js v22.11.0 MSI installer
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi' -OutFile '%~dp0node_installer.msi'"

if not exist "%~dp0node_installer.msi" (
    echo [ERROR] Failed to download the installer automatically.
    echo Please open your browser and download Node.js manually from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 3. Run the installer
echo [INFO] Opening the Node.js setup wizard...
echo Please complete the setup wizard (you can click "Next" on all prompts).
echo.
start /wait msiexec.exe /i "%~dp0node_installer.msi"

:: 4. Clean up installer file
if exist "%~dp0node_installer.msi" (
    del "%~dp0node_installer.msi"
)

echo ===================================================
echo Node.js installation wizard completed!
echo ===================================================
echo.
echo *** IMPORTANT: Please RESTART your computer now! ***
echo After restarting, double-click the desktop shortcut to launch the system.
echo.

:create_shortcut
:: 5. Capture the app folder path (strip trailing backslash)
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

echo [INFO] Creating a Desktop shortcut for the system...

powershell -Command "$wsh = New-Object -ComObject WScript.Shell; $s = $wsh.CreateShortcut(([Environment]::GetFolderPath('Desktop') + '\Fateh Vet Monitor.lnk')); $s.TargetPath = 'cmd.exe'; $s.Arguments = '/c \"\"' + '%APP_DIR%' + '\start.bat\"\"'; $s.WorkingDirectory = '%APP_DIR%'; $s.WindowStyle = 1; $s.Save()"

if %errorlevel% equ 0 (
    echo [SUCCESS] Desktop shortcut "Fateh Vet Monitor" created on your Desktop!
) else (
    echo [WARNING] Failed to create desktop shortcut automatically.
    echo You can manually create a shortcut to: %APP_DIR%\start.bat
)

echo.
pause
exit /b 0