# Outlook宛先作成アプリ

Outlookの送信履歴CSVから宛先(To)とCCを効率的に作成するツールです。

## 機能

- スペース区切りのキーワードでOR検索
- 宛先(To)とCCを独立して管理
- チェックした名前をセミコロン区切りでクリップボードにコピー
- フォントサイズの調整機能

---

## 会社での利用方法（ビルド済みファイルを使用）

### 必要なもの

- Python 3.12（サーバー起動用）
- ビルド済みファイル（`dist`フォルダ）

### 手順

#### 1. ファイルの配置

以下のフォルダ構成で配置してください：

```
dist/                              # このフォルダを配布
├── index.html
├── send_mail-ranking_tabulator.csv   # 送信先データ（ここに配置）
└── assets/
    ├── index-xxxxx.js
    └── index-xxxxx.css
```

#### 2. CSVファイルの準備

`send_mail-ranking_tabulator.csv`を`dist`フォルダの中に配置します。

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

#### 3. サーバーの起動（Windows）

コマンドプロンプトまたはPowerShellを開き、`dist`フォルダに移動してPythonサーバーを起動します。

**コマンドプロンプトの場合：**
```cmd
cd C:\path\to\outlook-address-maker\dist
python -m http.server 8080
```

**PowerShellの場合：**
```powershell
cd C:\path\to\outlook-address-maker\dist
python -m http.server 8080
```

#### 4. ブラウザでアクセス

サーバー起動後、ブラウザで以下のURLを開きます：

```
http://localhost:8080
```

#### 5. サーバーの停止

コマンドプロンプト/PowerShellで `Ctrl + C` を押すとサーバーが停止します。

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
```

### ビルド

```bash
npm run build
```

ビルド後、`dist`フォルダが生成されます。このフォルダを会社に持っていって使用します。

### テスト

```bash
npm run test
```

---

## トラブルシューティング

### CSVが読み込まれない

- `send_mail-ranking_tabulator.csv`が`dist`フォルダの中にあるか確認
- ファイル名が正確か確認（スペルミス注意）
- CSVの文字コードがUTF-8か確認

### ポート8080が使用中の場合

別のポート番号を指定してください：

```cmd
python -m http.server 3000
```

この場合、`http://localhost:3000` でアクセスします。

### Pythonが見つからない場合

Pythonのパスが通っているか確認してください：

```cmd
python --version
```

バージョンが表示されない場合は、Pythonのインストールパスを確認し、環境変数PATHに追加してください。
