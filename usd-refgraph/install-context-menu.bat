@echo off
rem ===========================================================================
rem  Adds "Open in Reference Graph" to the right-click menu of USD files.
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

echo.
echo   Add "Open in Reference Graph" to USD files
echo   =========================================
echo.

if not exist "%LAUNCHER%" (
    echo   [X] usd-refgraph.bat is not next to this script.
    echo       Keep both files together in the tool's folder.
    goto FAIL
)

echo   Launcher: %LAUNCHER%
echo.

for %%E in (.usd .usda .usdc .usdz) do call :REGISTER %%E
if errorlevel 1 goto FAIL

echo.
echo   Done. Right-click any .usd, .usda, .usdc or .usdz file and choose
echo   "Open in Reference Graph".
echo.
echo   On Windows 11 it may sit under "Show more options".
echo.
pause
endlocal
exit /b 0

:REGISTER
set "KEY=HKCU\Software\Classes\SystemFileAssociations\%~1\shell\USDReferenceGraph"
echo   - registering %~1
reg add "%KEY%" /ve /d "Open in Reference Graph" /f >nul || exit /b 1
reg add "%KEY%" /v Icon /d "%SystemRoot%\System32\shell32.dll,13" /f >nul || exit /b 1
reg add "%KEY%\command" /ve /d "\"%LAUNCHER%\" \"%%1\"" /f >nul || exit /b 1
exit /b 0

:FAIL
echo.
echo   Nothing was changed.
echo.
pause
endlocal
exit /b 1
