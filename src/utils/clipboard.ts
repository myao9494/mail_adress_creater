/**
 * クリップボード操作ユーティリティ
 */

/**
 * 選択された名前をセミコロン区切りでクリップボードにコピーする
 * @param names コピーする名前の配列
 * @returns コピー成功時はtrue、失敗時はfalse
 */
export async function copyToClipboard(names: string[]): Promise<boolean> {
  try {
    const text = formatNamesForClipboard(names)
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * 名前配列をセミコロン区切りの文字列に変換する
 * @param names 名前の配列
 * @returns セミコロン区切りの文字列
 */
export function formatNamesForClipboard(names: string[]): string {
  return names.join(';')
}
