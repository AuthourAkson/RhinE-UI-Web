@echo off
rem ============================================================================
rem  RhinE-UI launcher - just double-click
rem    1) starts the local server in its own window if it is not running
rem       (close that window to stop the server)
rem    2) opens the UI in a Chrome / Edge app window (no tabs, feels native)
rem
rem  Optional argument:
rem    launcher.cmd            default: adds ?demo=1 when .dev\music exists
rem    launcher.cmd plain      no ?demo=1 (use "+ ADD MUSIC FOLDER" instead)
rem    launcher.cmd 9000       use another port
rem ============================================================================
cd /d "%~dp0"
title RhinE-UI launcher
setlocal enabledelayedexpansion

set "PORT=8300"
set "DEMO=1"
if /i "%~1"=="plain" set "DEMO="
if not "%~1"=="" if /i not "%~1"=="plain" set "PORT=%~1"
if not exist ".dev\music" set "DEMO="

set "URL=http://127.0.0.1:!PORT!/"
if defined DEMO set "URL=http://127.0.0.1:!PORT!/?demo=1"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [x] Node.js not found. Please install it first: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

rem ---------------------------------------------------------------- server ---
set "SRV=down"
for /f "delims=" %%i in ('powershell -NoProfile -Command "try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',!PORT!); $c.Close(); 'up' }catch{ 'down' }" 2^>nul') do set "SRV=%%i"

if "!SRV!"=="up" (
  echo   server already running
) else (
  echo   starting local server on port !PORT! ...
  start "RhinE-UI server  -  close this window to stop it" cmd /k node serve.mjs !PORT!
  set "OK="
  for /l %%n in (1,1,15) do (
    if not defined OK (
      for /f "delims=" %%i in ('powershell -NoProfile -Command "try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',!PORT!); $c.Close(); 'up' }catch{ 'down' }" 2^>nul') do set "R=%%i"
      if "!R!"=="up" ( set "OK=1" ) else ( timeout /t 1 /nobreak >nul )
    )
  )
  if defined OK ( echo   server ready ) else ( echo   [!] server did not come up - check the new window )
)

rem --------------------------------------------------------------- browser ---
rem NOTE: %ProgramFiles(x86)% must not sit inside a FOR (...) list — the ")" in
rem       the variable name breaks the parsing. Collect the paths first, then
rem       loop over the *names* with delayed expansion.
set "CHROME1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "CHROME3=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "EDGE1=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "EDGE2=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "BROWSER="
for %%v in (CHROME1 CHROME2 CHROME3 EDGE1 EDGE2) do if not defined BROWSER if exist "!%%v!" set "BROWSER=!%%v!"

if defined BROWSER (
  echo   opening app window: !URL!
  start "" "!BROWSER!" --app="!URL!" --window-size=1600,1000
) else (
  echo   Chrome / Edge not found - opening in the default browser: !URL!
  start "" "!URL!"
)

timeout /t 2 /nobreak >nul
endlocal
exit /b 0
