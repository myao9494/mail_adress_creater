# CLAUDE.md - Outlook宛先作成アプリ

## プロジェクト概要

Outlookの送信履歴CSVから宛先(To)とCCを効率的に作成する軽量フロントエンドアプリ。

## 技術スタック

- **フレームワーク**: React 18 + TypeScript
- **ビルドツール**: Vite 6
- **スタイル**: Tailwind CSS
- **テスト**: Vitest + Testing Library

## コマンド

```bash
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド
npm run test     # テスト実行
npm run lint     # ESLint実行
```

## ディレクトリ構造

```
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
└── send_mail-ranking_tabulator.csv  # 入力データ
```

## 主要機能

1. **検索**: スペース区切りのOR検索、部分一致、Enterで実行
2. **選択**: チェックボックスで宛先を選択（初期は全選択）
3. **コピー**: セミコロン区切りでクリップボードにコピー
4. **フォントサイズ**: 各ペインで個別に調整可能（8-20px）

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
