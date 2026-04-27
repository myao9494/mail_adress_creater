# Outlook宛先作成アプリ

Outlookの送信履歴CSVから宛先(To)とCCを効率的に作成するツールです。

## 機能

- スペース区切りのキーワードでOR検索
- 宛先(To)とCCを独立して管理
- チェックした名前をセミコロン区切りでクリップボードにコピー
- フォントサイズの調整機能
- Outlookからのアドレス再取得（バックエンド使用時）
- 職アド通知のキーワードチェックと新規一致の強調表示
- PWA対応（バックエンド配信時にブラウザからインストール可能）

---

## 会社での利用方法

### 必要なもの

- Python 3.12
- Node.js / npm（初回ビルドまたは再ビルド用）
- WindowsでOutlook連携を使う場合: デスクトップ版Outlook、pywin32
- 配布ファイル一式（`backend`、`dist`、`public`、起動用ファイルを含むリポジトリルート）

### 手順

#### 1. ファイルの配置

以下のフォルダ構成で配置してください。バックエンドが`dist`を配信します。

```
outlook-address-maker/
├── backend/
│   ├── server.py
│   └── requirements.txt
├── dist/
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── send_mail-ranking_tabulator.csv
│   └── assets/
├── public/
│   └── send_mail-ranking_tabulator.csv
├── start_windows.bat
└── start_mac.command
```

#### 2. CSVファイルの準備

初期データを手動で用意する場合は、`public/send_mail-ranking_tabulator.csv`に配置してからビルドします。
バックエンドの「アドレス再取得」は`public/send_mail-ranking_tabulator.csv`と`dist/send_mail-ranking_tabulator.csv`を更新します。

**CSVフォーマット：**
```csv
名前,回数
山田 太郎,120
佐藤 一郎,200
鈴木 恒一,150
```

- 1行目はヘッダー（`名前,回数`）
- 名前：Outlookに貼り付ける表示名
- 回数：送信回数（並び替えに使用）

#### 3. サーバーの起動

起動用ファイルを使う場合:

- Windows: `start_windows.bat`
- Mac: `start_mac.command`

起動用ファイルは`dist/index.html`がない場合に`npm ci`と`npm run build`を実行し、その後バックエンドを起動します。

手動で起動する場合:

Outlook連携を使う場合は、コマンドプロンプトまたはPowerShellでリポジトリのルートに移動してバックエンドサーバーを起動します。
Outlook連携には Windows、Outlook、pywin32 が必要です。

**コマンドプロンプトの場合：**
```cmd
cd C:\path\to\outlook-address-maker
python backend\server.py
```

**PowerShellの場合：**
```powershell
cd C:\path\to\outlook-address-maker
python backend\server.py
```

**Mac / zshの場合：**
```bash
cd /path/to/outlook-address-maker
python3 backend/server.py
```

#### 4. ブラウザでアクセス

サーバー起動後、ブラウザで以下のURLを開きます。フロントエンドはバックエンドから配信されます。

```
http://localhost:8765
```

#### 5. サーバーの停止

コマンドプロンプト/PowerShellで `Ctrl + C` を押すとサーバーが停止します。

### バックエンド機能

- 「アドレス再取得」: Outlookの送信済みアイテムから宛先を再集計し、既存CSVにあって今回見つからなかった名前は回数0で残します。
- 「職アドキーワードチェック」: 件名に「職アドからのお知らせ」を含む受信メールから、登録キーワードに一致する本文行を保存します。新規一致は画面上部に目立つ表示で出ます。
- ハンバーガーメニュー: キーワード、アドレス再取得の自動実行頻度、キーワードチェックの自動実行頻度を設定できます。
- 既定値: アドレス再取得は43200分（約1ヶ月）、キーワードチェックは60分（1時間）です。
- 新規一致はチェック実行時のレスポンスで返ります。保存済み履歴の取得では既存一致として扱われ、`new_only=1`は互換性のため空配列を返します。
- 自動実行はジョブ単位で多重起動を抑止します。同じジョブが実行中の場合、次の同一ジョブはスキップされます。

### PWA

バックエンド配信時に`manifest.webmanifest`と`sw.js`が配信されます。Chrome / EdgeのインストールメニューからPWAとしてインストールできます。
Service Workerはアプリ本体をキャッシュしますが、`/api`とCSVはキャッシュしません。

---

## 使い方

1. 検索ボックスにキーワードを入力（スペース区切りで複数指定可）
2. Enterキーで検索実行
3. 検索結果から不要な人のチェックを外す
4. 「宛先作成」または「CC作成」ボタンをクリック
5. Outlookの宛先/CC欄に貼り付け（Ctrl+V）

---

## 開発者向け情報

### 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# バックエンドの起動（別ターミナル）
npm run backend
```

開発サーバーでは`/api`が`http://127.0.0.1:8765`へプロキシされます。

### ビルド

```bash
npm run build
```

ビルド後、`dist`フォルダが生成されます。実行時は`dist`だけでなく、`backend`や起動用ファイルを含むリポジトリルート一式を配置してください。

### テスト

```bash
npm run test

# バックエンドテスト
python -m unittest backend.test_server
```

### Lint

```bash
npm run lint
```

---

## トラブルシューティング

### Outlook連携が動かない

- Windows環境で実行しているか確認
- デスクトップ版Outlookが利用できる状態か確認
- pywin32をインストールしているか確認

```cmd
pip install -r backend\requirements.txt
```

MacではOutlook COM連携が使えないため、「アドレス再取得」と「職アドキーワードチェック」はエラー表示になります。

### CSVが読み込まれない

- `send_mail-ranking_tabulator.csv`が`public`または`dist`の中にあるか確認
- ファイル名が正確か確認（スペルミス注意）
- CSVの文字コードがUTF-8か確認

### ポート8765が使用中の場合

別のポート番号を指定してください：

```cmd
set OUTLOOK_ADDRESS_PORT=3000
python backend\server.py
```

この場合、`http://localhost:3000` でアクセスします。

### Pythonが見つからない場合

Pythonのパスが通っているか確認してください：

```cmd
python --version
```

バージョンが表示されない場合は、Pythonのインストールパスを確認し、環境変数PATHに追加してください。
