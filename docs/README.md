# Outlook宛先作成アプリ

## 概要

Outlookの送信履歴CSVとOutlook連携バックエンドを利用し、宛先（To）・CCを効率よく作成するアプリです。
フロントエンドはReact + Viteでビルドし、Pythonバックエンドが`dist`を静的配信します。

## アーキテクチャ

```
backend/
├── server.py              # API、静的配信、Outlook連携、SQLite保存
├── event_parser.py        # 自然文予定解析
├── requirements.txt       # Windows向けpywin32依存
└── test_server.py         # バックエンドテスト

src/
├── components/
│   ├── RecipientPane.tsx  # 宛先/CC選択ペイン
│   ├── HtmlEditor.tsx     # HTML/リッチテキストエディタ
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
- `POST /api/check-keywords`: 件名に「職アドからのお知らせ」を含む受信メールを確認し、登録キーワードに一致する本文行をSQLiteへ保存します。新規一致はレスポンスで返します。一致レコードは `confirmed=0`（未確認）で保存され、ユーザーが確認するまで画面に表示され続けます。
- `POST /api/parse-schedule`: 自然文の予定入力から件名、開始/終了日時、場所、終日予定を抽出します。
- `POST /api/add-schedule`: 解析済みまたは編集済みの予定をOutlook予定表へ追加します。
- `GET /api/settings`: キーワードと自動実行頻度を取得します。
- `PUT /api/settings`: キーワードと自動実行頻度を保存します。
- `GET /api/favorites`: お気に入り宛先グループを取得します。
- `PUT /api/favorites`: お気に入り宛先グループ全体を保存します。
- `POST /api/favorites/add`: 1件のお気に入りを追加または更新します。
- `GET /api/keyword-matches`: 保存済みキーワード一致を取得します。`unconfirmed_only=1`を指定すると未確認（ユーザー未確認）の一致のみを返します。アプリ起動時にこのフィルタを使い、未確認通知を復元します。`new_only=1`は互換性のため空配列を返し、新規一致は`POST /api/check-keywords`のレスポンスで確認します。
- `POST /api/keyword-matches/confirm`: IDリスト（JSON: `{"ids": [...]}` ）を受け取り、該当レコードを確認済み（`confirmed=1`）に更新します。ユーザーが「OK」ボタンを押したときに呼ばれます。
- `GET /api/database`: `settings`、`recipients`、`favorites`、`keyword_matches`、`job_runs`のスナップショットを取得します。
- `POST /api/database/delete`: `settings`以外のDBレコードを選択削除します。`recipients`削除時はCSVも同期更新します。
- `POST /api/seed-dummy-data`: Outlookを使えない環境で画面確認用のダミーデータを投入します。
- `GET /api/health`: バックエンド状態、設定、ジョブ状態を取得します。

自動実行スケジューラはジョブ単位のロックを使い、同じジョブが実行中の場合は重複起動をスキップします。
ブラウザからのAPIリクエストは同一Originのみ許可し、別OriginからのPOST/PUT/OPTIONSは拒否します。別Originに対する`Access-Control-Allow-Origin`は返しません。

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

名前にカンマを含む場合はダブルクォートで囲めます。フロントエンドの画面読み込みとバックエンドの既存CSVマージでは、回数が整数として読めない行は読み込み対象外です。フロントエンドはCSVを`no-store`で取得し、取得失敗時はエラーを表示します。

## テストと検証

```bash
npm run lint
npm test -- --run
npm run build
python -B -m unittest backend.test_server
```

## 技術スタック

- React 18 + TypeScript
- Vite 6
- Tailwind CSS
- Vitest + Testing Library
- Python 3.12 標準ライブラリ
- SQLite
- pywin32（WindowsでOutlook連携を使う場合）

## 設計・仕様ドキュメント

詳細な機能仕様や設計については、以下のドキュメントを参照してください。

- [お気に入りの宛先・CCワンセット管理機能 仕様書](file:///Users/mine/000_work/temp/mail_adress_creater/docs/favorites_spec.md) ([構成図](file:///Users/mine/000_work/temp/mail_adress_creater/docs/favorites.excalidraw))
- [除外キーワード機能 仕様書](file:///Users/mine/000_work/temp/mail_adress_creater/docs/exclude_keywords_spec.md)
- [HTML本文予定作成機能 仕様書](file:///Users/mine/000_work/temp/mail_adress_creater/docs/html_body_spec.md) ([動作フロー図](file:///Users/mine/000_work/temp/mail_adress_creater/docs/html_body.excalidraw))
