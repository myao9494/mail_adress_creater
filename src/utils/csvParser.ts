/**
 * CSVファイルをパースして送信先データを取得するユーティリティ
 */
import type { Recipient } from '../types'

/**
 * CSV文字列をパースしてRecipient配列を返す
 * @param csvText CSV形式の文字列
 * @returns パースされたRecipient配列（回数の降順でソート済み）
 */
export function parseCSV(csvText: string): Recipient[] {
  const lines = csvText.split('\n')
  const recipients: Recipient[] = []

  // ヘッダー行をスキップして2行目から処理
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue // 空行をスキップ

    const [name, countStr] = line.split(',')
    if (name && countStr) {
      recipients.push({
        name: name.trim(),
        count: parseInt(countStr.trim(), 10),
      })
    }
  }

  // 回数の降順でソート
  return recipients.sort((a, b) => b.count - a.count)
}

/**
 * public/send_mail-ranking_tabulator.csvを読み込む
 * @returns パースされたRecipient配列
 */
export async function loadRecipients(): Promise<Recipient[]> {
  const response = await fetch('/send_mail-ranking_tabulator.csv')
  const csvText = await response.text()
  return parseCSV(csvText)
}
