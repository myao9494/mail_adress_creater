@echo off
setlocal
cd /d "%~dp0"

if not exist dist\index.html (
  echo dist\index.html was not found. Building frontend...
  call npm ci
  if errorlevel 1 goto error
  call npm run build
  if errorlevel 1 goto error
)

echo Starting Outlook address maker...
start "" "http://127.0.0.1:8765"
python backend\server.py
goto end

:error
echo Failed to start.
pause

:end
endlocal
