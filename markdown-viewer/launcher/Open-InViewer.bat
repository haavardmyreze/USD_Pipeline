@echo off
setlocal
REM Debug entry point with a visible console. Normal file associations use Open-InViewer.vbs.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-InViewer.ps1" %*
