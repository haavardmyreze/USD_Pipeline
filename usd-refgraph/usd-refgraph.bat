@echo off
rem ===========================================================================
rem  USD Reference Graph - launcher
rem
rem  Double-click to start, or drop something on this icon to open it straight
rem  away: a project folder opens the whole tree on the overview, a single
rem  .usd / .usda / .usdc / .usdz file opens its graph.
rem
rem  The first run sets everything up; later runs go straight to the app.
rem ===========================================================================

setlocal EnableExtensions
title USD Reference Graph
cd /d "%~dp0"

set "VENV_PY=%CD%\.venv\Scripts\python.exe"

echo.
echo   USD Reference Graph
echo   ===================
echo.

if exist "%VENV_PY%" goto CHECK_VIEWER

rem --------------------------------------------------------------- setup ---
echo   First run - setting this up. It takes a minute, and only happens once.
echo.

set "BOOT="
where py >nul 2>&1
if not errorlevel 1 set "BOOT=py -3"
if not defined BOOT (
    where python >nul 2>&1
    if not errorlevel 1 set "BOOT=python"
)
if not defined BOOT (
    echo   [X] Python was not found on this machine.
    echo.
    echo       Install Python 3.9 or newer from https://www.python.org/downloads/
    echo       During setup, tick "Add python.exe to PATH", then run this again.
    goto FAIL
)

echo   - creating the Python environment
%BOOT% -m venv ".venv"
if errorlevel 1 (
    echo   [X] Could not create the Python environment.
    goto FAIL
)

echo   - installing OpenUSD ^(usd-core, about 50 MB^)
"%VENV_PY%" -m pip install --quiet --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
    echo   [X] Could not install usd-core. Check your internet connection.
    goto FAIL
)
echo.

:CHECK_VIEWER
rem -------------------------------------------------------------- viewer ---
if exist "dist\index.html" goto RUN

where npm >nul 2>&1
if errorlevel 1 (
    echo   [X] The viewer has not been built, and Node.js was not found.
    echo.
    echo       Either install Node.js from https://nodejs.org and run this
    echo       again, or ask for a copy of this folder that already has a
    echo       "dist" folder in it - then only Python is needed.
    goto FAIL
)

if not exist "node_modules" (
    echo   - installing web dependencies
    call npm install --silent
    if errorlevel 1 (
        echo   [X] npm install failed.
        goto FAIL
    )
)

echo   - building the viewer
call npm run build
if errorlevel 1 (
    echo   [X] The build failed.
    goto FAIL
)
echo.

:RUN
rem ----------------------------------------------------------------- run ---
echo   Starting. Your browser will open in a moment.
echo   Leave this window open while you use it; close it to stop.
echo.

pushd server
"%VENV_PY%" -m usd_refgraph %*
set "CODE=%ERRORLEVEL%"
popd

if not "%CODE%"=="0" goto FAIL
endlocal
exit /b 0

:FAIL
echo.
echo   ---------------------------------------------------------------
echo   Stopped. Press any key to close this window.
echo   ---------------------------------------------------------------
pause >nul
endlocal
exit /b 1
