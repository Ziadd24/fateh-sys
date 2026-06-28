@echo off
title Vet Monitor - First Time Setup
echo ===================================================
echo 🐾 Vet Monitor - Offline Installation Helper 🐾
echo ===================================================
echo.
echo This script will help you install Node.js (required to run the system offline).
echo.

:: 1. Check if Node.js is already installed
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Node.js is already installed!
    echo You do not need to install it again.
    echo.
    echo You can now close this window and double-click "start.bat" to run the system.
    echo.
    pause
    exit /b 0
)

:: 2. Download Node.js Installer
echo [INFO] Downloading the official Node.js installer...
echo Please wait, this might take a minute depending on your internet speed...
echo.

:: Use PowerShell to download the official Node.js v22.11.0 MSI installer
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi' -OutFile 'node_installer.msi'"

if not exist "node_installer.msi" (
    echo ✖ [ERROR] Failed to download the installer automatically.
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
start /wait msiexec.exe /i node_installer.msi

:: 4. Clean up installer file
if exist "node_installer.msi" (
    del node_installer.msi
)

echo ===================================================
echo 🎉 Node.js installation wizard completed!
echo ===================================================
echo.
echo Please restart your computer (or close and reopen your folders) 
echo and then double-click "start.bat" to start the Vet Monitor system.
echo.
pause
