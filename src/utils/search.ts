/**
 * 送信先データを検索するユーティリティ
 */
import type { Recipient } from '../types'

/**
 * 検索クエリに基づいてRecipient配列をフィルタリングする
 * - 半角/全角スペースで区切ってOR検索
 * - 部分一致
 * - 大文字・小文字を区別しない
 * - 空クエリの場合は全件返却
 *
 * @param recipients 検索対象のRecipient配列
 * @param query 検索クエリ（半角/全角スペース区切りでOR検索）
 * @returns フィルタリングされたRecipient配列
 */
export function searchRecipients(recipients: Recipient[], query: string): Recipient[] {
  const trimmedQuery = query.trim()

  // 空クエリの場合は全件返却
  if (!trimmedQuery) {
    return recipients
  }

  // 半角スペースと全角スペースの両方で区切ってキーワード配列を作成
  const keywords = trimmedQuery.split(/[ 　]+/).filter(k => k.length > 0)

  // 各キーワードで部分一致（OR検索）
  return recipients.filter(recipient => {
    const nameLower = recipient.name.toLowerCase()
    return keywords.some(keyword => nameLower.includes(keyword.toLowerCase()))
  })
}
