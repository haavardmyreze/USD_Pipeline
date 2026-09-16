@echo off
rem Starts the tree diagram tool and opens it in the browser.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install || exit /b 1
)
call npm run dev
