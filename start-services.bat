@echo off
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-services.ps1" %*
endlocal
