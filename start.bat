@echo off
title Fateh Vet Monitor

:: Always run from the script's own folder, regardless of where it was launched from
cd /d "%~dp0"

echo ===================================================
echo Starting Vet Monitor System...
echo ===================================================

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not installed or not in your system PATH!
    echo.
    echo Please run setup.bat first, then RESTART your computer,
    echo and try again.
    echo.
    pause
    exit /b 1
)

:: 2. Check Node.js version (Requires 22+)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
for /f "tokens=1 delims=." %%a in ("%NODE_VER:v=%") do set NODE_MAJOR=%%a

if %NODE_MAJOR% lss 22 (
    echo.
    echo [WARNING] Node.js version %NODE_VER% is older than required (v22+).
    echo Please upgrade from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 3. Install dependencies if missing
if not exist "node_modules\" (
    echo [INFO] Installing required dependencies - first-time setup...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies.
        echo Please run this script from inside the fateh-sys folder,
        echo or run 'npm install' manually in that folder.
        echo.
        pause
        exit /b 1
    )
)

:: 4. Start the server
echo.
echo [INFO] Starting the Vet Monitor server...
echo [INFO] The dashboard will open in your browser at http://localhost:3000
echo.
echo To stop the server, close this window.
echo.

npm start

pause