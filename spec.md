# Outlook宛先作成アプリ 仕様書

## 1. 目的

Outlookの送信履歴から抽出した「送信先名 × 送信回数」のデータを利用し、宛先（To）とCCを効率よく作成してOutlookに貼り付けるための補助アプリを提供する。

加えて、Outlookの送信済みアイテムからのアドレス再取得と、職アド通知メールのキーワードチェックをバックエンドで実行できるようにする。

人間が最終確認・取捨選択を行う前提とし、完全自動送信は行わない。

## 2. 構成

### 2.1 フロントエンド

- React 18 + TypeScript
- Vite 6
- Tailwind CSS
- PWA対応
- `dist`にビルドされた静的ファイルをバックエンドが配信する

### 2.2 バックエンド

- Python 3.12
- `backend/server.py`
- 標準ライブラリの`http.server`でAPIと`dist`を配信
- SQLiteで設定、キーワード一致、ジョブ実行結果を保存
- Windows + Outlook + pywin32 がある環境でOutlook COM連携を実行

## 3. 入力データ仕様

### 3.1 CSVファイル

- ファイル名: `send_mail-ranking_tabulator.csv`
- 元データ配置: `public/send_mail-ranking_tabulator.csv`
- 配信データ配置: `dist/send_mail-ranking_tabulator.csv`
- 読み込み方法: フロントエンドから`fetch('/send_mail-ranking_tabulator.csv')`
- 更新方法: バックエンドの`POST /api/refresh-addresses`

### 3.2 CSVフォーマット

| 列名 | 型 | 説明 |
| --- | --- | --- |
| 名前 | string | Outlookに貼り付ける表示名 |
| 回数 | number | 送信回数。表示とソートに使用 |

```csv
名前,回数
山田 太郎,120
佐藤 一郎,200
```

## 4. 画面構成

### 4.1 上部メニュー

- ハンバーガーメニュー
- 「アドレス再取得」ボタン
- 「職アドキーワードチェック」ボタン
- 実行中はボタンを無効化し、ラベルを実行中表示にする
- 実行エラーは画面上部に表示する

### 4.2 ハンバーガーメニュー

以下を設定できる。

- 職アドキーワード
- アドレス再取得の自動実行頻度（分）
- 職アドキーワードチェックの自動実行頻度（分）

既定値:

- キーワード: `棚卸`、`棚おろし`、`ユーザID`
- アドレス再取得: 43200分（約1ヶ月）
- キーワードチェック: 60分（1時間）

### 4.3 2ペイン

- 左ペイン: 宛先（To）
- 右ペイン: CC
- 宛先とCCは完全に独立した検索・チェック状態を持つ

## 5. ペイン共通仕様

### 5.1 検索機能

- 入力方式: 複数行テキストエリア
- 区切り文字: 半角スペース、全角スペース、その他空白
- 検索方式: OR検索
- 検索条件: 部分一致
- 大文字・小文字: 区別しない
- Enterキーで検索実行
- Shift+Enterで検索実行後に結果リストへフォーカス移動

### 5.2 検索結果表示

- チェックボックス
- 名前
- 回数
- 並び順は回数の降順
- 検索結果は初期状態ですべてチェックON
- マッチしなかったキーワードを表示する

### 5.3 コピー

- 左ペイン: 「宛先作成」
- 右ペイン: 「CC作成」
- チェックONの名前を`;`で連結してクリップボードにコピーする
- 名前部分をクリックすると、その名前だけをクリップボードにコピーする
- コピー成功時はトーストを表示する

### 5.4 フォントサイズ

- 各ペインで個別に8pxから20pxまで調整できる

## 6. バックエンドAPI仕様

### 6.1 アドレス再取得

`POST /api/refresh-addresses`

- Outlookの送信済みアイテムから宛先名を取得する
- 取得上限の既定値は150件
- 宛先名ごとに回数を集計する
- 既存CSVと新規集計結果を名前でマージする
- 今回存在しなかった既存アドレスは回数0として残す
- `public/send_mail-ranking_tabulator.csv`と`dist/send_mail-ranking_tabulator.csv`へ保存する
- SQLiteの`recipients`にも保存する

### 6.2 職アドキーワードチェック

`POST /api/check-keywords`

- Outlookの受信トレイを確認する
- 件名に「職アドからのお知らせ」を含むメールを対象にする
- 本文行のうち、登録キーワードを含む行を抽出する
- SQLiteの`keyword_matches`に保存する
- 初めて保存された一致を`new_matches`として返す
- 新規一致は画面上部で目立つ形で表示する
- 保存済み履歴の取得では既存一致として扱う
- `GET /api/keyword-matches?new_only=1`は互換性のため空配列を返し、新規一致の判定はチェック実行時の`new_matches`で行う

### 6.3 設定

- `GET /api/settings`
- `PUT /api/settings`

保存項目:

- `keywords`
- `address_interval_minutes`
- `keyword_interval_minutes`

### 6.4 状態確認

`GET /api/health`

- バックエンドの起動状態
- 現在の設定
- ジョブ実行結果
- 自動実行はジョブ単位で多重起動を抑止する

## 7. PWA仕様

- `public/manifest.webmanifest`を配信する
- `public/sw.js`をService Workerとして登録する
- アプリ本体はキャッシュする
- `/api`とCSVはキャッシュしない
- Chrome / Edgeからインストール可能にする

## 8. 対応環境

- 開発環境: macOS / Windows
- 利用環境: Windows推奨
- ブラウザ: Chrome / Edge
- Outlook連携: Windows + デスクトップ版Outlook + pywin32

Macではバックエンド配信とフロントエンド操作は可能だが、Outlook COM連携を使う機能はエラー表示になる。

## 9. 非対応事項

- メールの自動送信
- ユーザー認証・権限管理
- 複数ユーザー同時利用を前提とした権限制御
- Web版Outlook API / Microsoft Graph API連携

## 10. 補足

本アプリは「人間の判断を前提とした補助ツール」であり、確認しやすさと軽快さを優先する。
