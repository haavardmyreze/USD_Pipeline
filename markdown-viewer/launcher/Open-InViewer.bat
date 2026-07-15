@echo off
setlocal
REM Debug/manual entry point. File associations invoke Open-InViewer.vbs directly.
wscript.exe //Nologo "%~dp0Open-InViewer.vbs" %*
exit /b %ERRORLEVEL%
