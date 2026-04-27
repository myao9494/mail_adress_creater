@echo off
setlocal
cd /d "%~dp0"

if not exist dist\index.html (
  echo dist\index.html が見つかりません。フロントエンドをビルドします。
  call npm ci
  if errorlevel 1 goto error
  call npm run build
  if errorlevel 1 goto error
)

echo Outlook宛先作成アプリを起動します。
echo ブラウザで http://127.0.0.1:8765 を開いてください。
python backend\server.py
goto end

:error
echo 起動に失敗しました。
pause

:end
endlocal
