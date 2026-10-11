@echo off
rem ============================================================================
rem  RhinE-UI stopper - just double-click
rem    stops the local server on the given port (default 8300) and also cleans
rem    up the headless Chrome that the dev tests may have left behind.
rem    It only kills headless instances started with .dev\chrome-profile,
rem    your own Chrome windows are never touched.
rem ============================================================================
cd /d "%~dp0"
title RhinE-UI stop
setlocal enabledelayedexpansion

set "PORT=8300"
if not "%~1"=="" set "PORT=%~1"

echo   stopping the server on port !PORT! ...
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":!PORT!" ^| findstr LISTENING') do (
  echo   killing PID %%p
  taskkill /f /pid %%p >nul 2>nul
  set "FOUND=1"
)
if not defined FOUND echo   nothing is listening on !PORT!

echo.
echo   cleaning up leftover headless Chrome from dev tests ...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*RhinE-UI\.dev\chrome-profile*' } | ForEach-Object { Write-Host ('  killing headless PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" 2>nul

echo.
echo   done.
timeout /t 3 /nobreak >nul
exit /b 0
