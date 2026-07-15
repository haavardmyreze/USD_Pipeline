@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-InViewer.ps1" %*
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo Quiet Reader launcher failed with exit code %EXITCODE%.
  echo See %TEMP%\quiet-reader-launcher.log for details.
  pause
)
exit /b %EXITCODE%
