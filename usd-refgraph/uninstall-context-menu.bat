@echo off
rem ===========================================================================
rem  Removes "Open in Reference Graph" from the right-click menu of USD files.
rem  Undoes install-context-menu.bat exactly; nothing else is touched.
rem ===========================================================================

setlocal EnableExtensions
title USD Reference Graph - remove right-click menu

echo.
echo   Remove "Open in Reference Graph" from USD files
echo   ==============================================
echo.

for %%E in (.usd .usda .usdc .usdz) do call :UNREGISTER %%E

echo.
echo   Done.
echo.
pause
endlocal
exit /b 0

:UNREGISTER
set "KEY=HKCU\Software\Classes\SystemFileAssociations\%~1\shell\USDReferenceGraph"
reg query "%KEY%" >nul 2>&1
if errorlevel 1 (
    echo   - %~1 was not registered
    exit /b 0
)
reg delete "%KEY%" /f >nul 2>&1
if errorlevel 1 (
    echo   - %~1 could not be removed
) else (
    echo   - removed %~1
)
exit /b 0
