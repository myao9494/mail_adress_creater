# Outlook宛先作成アプリ

## 概要

Outlookの送信履歴から抽出した「送信先名 × 送信回数」のCSVデータを利用し、宛先（To）・CCを効率よく作成するフロントエンド専用アプリ。

## アーキテクチャ

```
src/
├── components/          # UIコンポーネント
│   ├── RecipientPane.tsx    # 宛先選択ペイン
│   └── Toast.tsx            # トースト通知
├── hooks/               # カスタムフック
│   ├── useRecipients.ts     # CSV読み込み
│   └── useSearch.ts         # 検索・チェック状態管理
├── utils/               # ユーティリティ
│   ├── csvParser.ts         # CSVパース
│   ├── search.ts            # 検索ロジック
│   └── clipboard.ts         # クリップボード操作
├── types/               # 型定義
│   └── index.ts
└── App.tsx              # メインコンポーネント
```

## 使い方

### 開発サーバー起動

```bash
npm run dev
```

### ビルド

```bash
npm run build
```

### テスト

```bash
npm test
```

## 操作方法

1. 検索ボックスにキーワードを入力
2. Enterキーで検索実行（半角スペース区切りでOR検索）
3. 検索結果から不要な宛先のチェックを外す
4. 「宛先作成」または「CC作成」ボタンをクリック
5. クリップボードにコピーされた文字列をOutlookに貼り付け

## CSVファイル

`public/send_mail-ranking_tabulator.csv` に配置：

```csv
名前,回数
山田 太郎,120
佐藤 一郎,200
```

## 技術スタック

- Vite
- React 18 + TypeScript
- Tailwind CSS
- Vitest + Testing Library
