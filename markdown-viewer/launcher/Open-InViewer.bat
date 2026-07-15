@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-InViewer.ps1" %*
exit /b %ERRORLEVEL%
