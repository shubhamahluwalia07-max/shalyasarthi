@echo off
title Shalya Saarthi - Surgical Planning Suite
echo =======================================================
echo   Starting Shalya Saarthi...
echo =======================================================
echo.

:: Check if Python is installed
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on your system PATH.
    echo Please install Python 3.8 or higher and add it to your PATH.
    pause
    exit /b 1
)

:: Run the python startup coordinator
python "%~dp0run.py"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application failed to start or was stopped unexpectedly.
    pause
)
