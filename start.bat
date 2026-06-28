@echo off
title Fateh Vet Monitor

cd /d "%~dp0"

echo ===================================================
echo Starting Vet Monitor System...
echo ===================================================

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

if not exist "node_modules\" (
    echo [INFO] Installing required dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Starting the server...
echo [INFO] Open your browser at http://localhost:3000
echo.
echo To stop the server, close this window.
echo.

npm start

pause