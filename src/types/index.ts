/**
 * アプリケーション全体で使用する型定義
 */

/**
 * CSVから読み込む送信先データ
 */
export type Recipient = {
  /** 送信先名（Outlookに貼り付ける表示名） */
  name: string
  /** 送信回数（表示・ソート用） */
  count: number
}

/**
 * チェック状態を持つ送信先データ
 */
export type CheckableRecipient = Recipient & {
  /** チェック状態 */
  checked: boolean
}
