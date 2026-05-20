@echo off
REM Start Services Batch Script
REM This script executes the PowerShell start-services.ps1 script

setlocal enabledelayedexpansion

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

REM Execute PowerShell script
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-services.ps1" %*

endlocal
