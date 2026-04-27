# Outlook宛先作成アプリ

## 概要

Outlookの送信履歴CSVとOutlook連携バックエンドを利用し、宛先（To）・CCを効率よく作成するアプリです。
フロントエンドはReact + Viteでビルドし、Pythonバックエンドが`dist`を静的配信します。

## アーキテクチャ

```
backend/
├── server.py              # API、静的配信、Outlook連携、SQLite保存
├── requirements.txt       # Windows向けpywin32依存
└── test_server.py         # バックエンドテスト

src/
├── components/
│   ├── RecipientPane.tsx  # 宛先/CC選択ペイン
│   └── Toast.tsx          # トースト通知
├── hooks/
│   ├── useRecipients.ts   # CSV読み込み・再読み込み
│   └── useSearch.ts       # 検索・チェック状態管理
├── utils/
│   ├── api.ts             # バックエンドAPI通信
│   ├── clipboard.ts       # クリップボード操作
│   ├── csvParser.ts       # CSVパース
│   └── search.ts          # 検索ロジック
├── types/
│   └── index.ts
├── App.tsx
└── main.tsx               # ReactマウントとService Worker登録

public/
├── icons/icon.svg
├── manifest.webmanifest
├── send_mail-ranking_tabulator.csv
└── sw.js
```

## 起動

### バックエンド配信

```bash
npm run build
npm run backend
```

ブラウザで`http://127.0.0.1:8765`を開きます。

### 起動用ファイル

- Windows: `start_windows.bat`
- Mac: `start_mac.command`

`dist/index.html`が存在しない場合は、起動時に`npm ci`と`npm run build`を実行します。

### 開発サーバー

```bash
npm run dev
```

Vite開発サーバーでは`/api`を`http://127.0.0.1:8765`へプロキシします。APIを使う場合は別ターミナルで`npm run backend`も起動します。

## 操作方法

1. 検索ボックスにキーワードを入力
2. Enterキーで検索実行（半角・全角スペース区切りでOR検索）
3. 検索結果から不要な宛先のチェックを外す
4. 「宛先作成」または「CC作成」ボタンをクリック
5. クリップボードにコピーされた文字列をOutlookに貼り付け

## バックエンド機能

- `POST /api/refresh-addresses`: Outlook送信済みアイテムから宛先を再集計し、CSVとSQLiteへ保存します。既存CSVにあり今回見つからなかった名前は回数0で残します。
- `POST /api/check-keywords`: 件名に「職アドからのお知らせ」を含む受信メールを確認し、登録キーワードに一致する本文行をSQLiteへ保存します。新規一致はレスポンスで返します。
- `GET /api/settings`: キーワードと自動実行頻度を取得します。
- `PUT /api/settings`: キーワードと自動実行頻度を保存します。
- `GET /api/keyword-matches`: 保存済みキーワード一致を取得します。保存済み履歴は既存一致として返します。`new_only=1`は互換性のため空配列を返し、新規一致は`POST /api/check-keywords`のレスポンスで確認します。
- `GET /api/health`: バックエンド状態、設定、ジョブ状態を取得します。

自動実行スケジューラはジョブ単位のロックを使い、同じジョブが実行中の場合は重複起動をスキップします。

## PWA

`manifest.webmanifest`と`sw.js`を`public`に配置しています。ビルド時に`dist`へコピーされ、バックエンドから配信されます。
Service Workerはアプリ本体をキャッシュし、`/api`とCSVはキャッシュ対象外にしています。

## CSVファイル

配置場所:

- 開発/元データ: `public/send_mail-ranking_tabulator.csv`
- バックエンド配信: `dist/send_mail-ranking_tabulator.csv`

```csv
名前,回数
山田 太郎,120
佐藤 一郎,200
```

## テストと検証

```bash
npm run lint
npm test -- --run
npm run build
python -m unittest backend.test_server
```

## 技術スタック

- React 18 + TypeScript
- Vite 6
- Tailwind CSS
- Vitest + Testing Library
- Python 3.12 標準ライブラリ
- SQLite
- pywin32（WindowsでOutlook連携を使う場合）
