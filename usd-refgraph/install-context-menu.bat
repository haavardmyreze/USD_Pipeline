@echo off
rem ===========================================================================
rem  Adds "Open in Reference Graph" to the Windows right-click menu, on:
rem
rem    - a project folder, which is the usual way in: the whole tree is
rem      scanned and the app opens on the project overview
rem    - the empty space inside a folder, meaning that folder
rem    - a single USD file, which opens straight onto its graph
rem
rem  Writes only to HKEY_CURRENT_USER, so it needs no administrator rights,
rem  changes nothing for other users, and does not touch which program owns
rem  the file type - your existing double-click behaviour is unaffected.
rem
rem  Run uninstall-context-menu.bat to remove it again.
rem ===========================================================================

setlocal EnableExtensions
title USD Reference Graph - install right-click menu
cd /d "%~dp0"

set "LAUNCHER=%~dp0usd-refgraph.bat"
set "ICON=%SystemRoot%\System32\shell32.dll,13"

echo.
echo   Add "Open in Reference Graph" to the right-click menu
echo   ====================================================
echo.

if not exist "%LAUNCHER%" (
    echo   [X] usd-refgraph.bat is not next to this script.
    echo       Keep both files together in the tool's folder.
    goto FAIL
)

echo   Launcher: %LAUNCHER%
echo.

rem  TOKEN is the placeholder Explorer fills in when it runs the command, and
rem  it has to reach the registry as a literal `%1` or `%V`. It cannot be
rem  passed to :REGISTER as an argument - `call` would expand it a second time
rem  and substitute this script's own arguments instead - so it travels in a
rem  variable that :REGISTER reads directly.

rem -- Folders: the project, which is what you usually want ----------------
echo   Folders
set "TOKEN=%%1"
call :REGISTER "Directory\shell" "Open project in Reference Graph"
if errorlevel 1 goto FAIL

rem  Right-clicking the empty space inside a folder means "this folder", and
rem  Explorer passes that as %V rather than %1.
set "TOKEN=%%V"
call :REGISTER "Directory\Background\shell" "Open project in Reference Graph"
if errorlevel 1 goto FAIL

rem -- Single USD files ----------------------------------------------------
echo   Files
set "TOKEN=%%1"
for %%E in (.usd .usda .usdc .usdz) do (
    call :REGISTER "SystemFileAssociations\%%E\shell" "Open in Reference Graph"
    if errorlevel 1 goto FAIL
)

echo.
echo   Done.
echo.
echo   - Right-click a project folder, or inside one, and choose
echo     "Open project in Reference Graph".
echo   - Right-click a .usd, .usda, .usdc or .usdz file for
echo     "Open in Reference Graph".
echo.
echo   On Windows 11 both may sit under "Show more options".
echo.
pause
endlocal
exit /b 0

rem ---------------------------------------------------------------------------
rem  :REGISTER  <parent key under Software\Classes>  <menu text>
rem  Reads TOKEN for the argument Explorer substitutes.
rem ---------------------------------------------------------------------------
:REGISTER
set "KEY=HKCU\Software\Classes\%~1\USDReferenceGraph"
echo     - %~1
reg add "%KEY%" /ve /d "%~2" /f >nul || exit /b 1
reg add "%KEY%" /v Icon /d "%ICON%" /f >nul || exit /b 1
reg add "%KEY%\command" /ve /d "\"%LAUNCHER%\" \"%TOKEN%\"" /f >nul || exit /b 1
exit /b 0

:FAIL
echo.
echo   Something went wrong. Run uninstall-context-menu.bat to clear up
echo   anything that was written before the failure.
echo.
pause
endlocal
exit /b 1
