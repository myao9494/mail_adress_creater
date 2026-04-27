#!/bin/zsh
set -e
cd "$(dirname "$0")"

BASE_PORT=8765
MAX_OFFSET=20
HOST=127.0.0.1
PORT=$BASE_PORT

if [ ! -f dist/index.html ]; then
  echo "dist/index.html が見つかりません。フロントエンドをビルドします。"
  npm ci
  npm run build
fi

if lsof -ti tcp:$BASE_PORT >/dev/null 2>&1; then
  PIDS=($(lsof -ti tcp:$BASE_PORT | sort -u))
  if [ ${#PIDS[@]} -gt 0 ]; then
    echo "ポート $BASE_PORT を使用中のプロセスを停止します: ${PIDS[*]}"
    kill "${PIDS[@]}" 2>/dev/null || true
    sleep 1
    if lsof -ti tcp:$BASE_PORT >/dev/null 2>&1; then
      PIDS=($(lsof -ti tcp:$BASE_PORT | sort -u))
      echo "通常停止できなかったため強制停止します: ${PIDS[*]}"
      kill -9 "${PIDS[@]}" 2>/dev/null || true
      sleep 1
    fi
  fi
fi

for offset in $(seq 0 $MAX_OFFSET); do
  candidate=$((BASE_PORT + offset))
  if ! lsof -iTCP:$candidate -sTCP:LISTEN >/dev/null 2>&1; then
    PORT=$candidate
    break
  fi
done

if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "$BASE_PORT 番以降で空きポートを見つけられませんでした。"
  exit 1
fi

echo "Outlook宛先作成アプリを起動します。"
echo "ブラウザで http://$HOST:$PORT を開いてください。"
OUTLOOK_ADDRESS_HOST=$HOST OUTLOOK_ADDRESS_PORT=$PORT python3 backend/server.py
