@echo off
python "%~dp0launch.py"
if errorlevel 1 (
  echo.
  echo Failed to start. Ensure Python 3 is installed and available in PATH.
  pause
)
