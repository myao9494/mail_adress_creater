# AGENTS.md - Outlook宛先作成アプリ

## プロジェクト概要

Outlookの送信履歴CSVから宛先(To)とCCを効率的に作成し、バックエンドからOutlook連携・PWA配信も行う軽量アプリ。

## 技術スタック

- **フレームワーク**: React 18 + TypeScript
- **ビルドツール**: Vite 6
- **スタイル**: Tailwind CSS
- **テスト**: Vitest + Testing Library
- **バックエンド**: Python 3.12 標準ライブラリ + SQLite
- **Outlook連携**: Windows + pywin32

## コマンド

```bash
npm run dev      # 開発サーバー起動
npm run backend  # バックエンド起動（dist配信/API）
npm run build    # プロダクションビルド
npm run test     # テスト実行
npm run lint     # ESLint実行
python -m unittest backend.test_server  # バックエンドテスト
```

## ディレクトリ構造

```
backend/
├── server.py       # API/静的配信/Outlook連携
├── requirements.txt
└── test_server.py

src/
├── components/     # UIコンポーネント
│   ├── RecipientPane.tsx  # 宛先/CCペイン
│   └── Toast.tsx          # 通知トースト
├── hooks/          # カスタムフック
│   ├── useRecipients.ts   # CSV読み込み
│   └── useSearch.ts       # 検索ロジック
├── utils/          # ユーティリティ
│   ├── csvParser.ts       # CSV解析
│   ├── search.ts          # 検索処理
│   └── clipboard.ts       # クリップボード操作
├── types/          # 型定義
│   └── index.ts
├── App.tsx         # メインコンポーネント
└── main.tsx        # エントリーポイント

public/
├── icons/icon.svg
├── manifest.webmanifest
├── sw.js
└── send_mail-ranking_tabulator.csv  # 入力データ

dist/  # バックエンドから配信されるビルド成果物
```

## 主要機能

1. **検索**: スペース区切りのOR検索、部分一致、Enterで実行
2. **選択**: チェックボックスで宛先を選択（初期は全選択）
3. **コピー**: セミコロン区切りでクリップボードにコピー
4. **フォントサイズ**: 各ペインで個別に調整可能（8-20px）
5. **アドレス再取得**: Outlook送信済みアイテムから再集計し、今回存在しない既存アドレスは0回で残す
6. **職アドチェック**: 登録キーワードに一致する通知行をSQLiteへ保存し、新規一致を画面に強調表示
7. **PWA**: バックエンド配信時にインストール可能

## CSVフォーマット

```csv
名前,回数
山田 太郎,120
佐藤 一郎,200
```

## 開発方針

- TDD（テスト駆動開発）で進める
- コンポーネントの冒頭に日本語で仕様コメントを記述
- 宛先とCCは完全に独立した状態管理
- ダークモードをデフォルトで使用
