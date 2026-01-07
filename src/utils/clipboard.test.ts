/**
 * クリップボード機能のテスト
 * 期待動作:
 * - 名前配列をセミコロン区切りで連結
 * - クリップボードにコピー
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatNamesForClipboard, copyToClipboard } from './clipboard'

describe('formatNamesForClipboard', () => {
  it('名前配列をセミコロン区切りで連結', () => {
    const names = ['山田 太郎', '鈴木 恒一', '佐藤 一郎']

    const result = formatNamesForClipboard(names)

    expect(result).toBe('山田 太郎;鈴木 恒一;佐藤 一郎')
  })

  it('単一の名前はそのまま返す', () => {
    const names = ['山田 太郎']

    const result = formatNamesForClipboard(names)

    expect(result).toBe('山田 太郎')
  })

  it('空配列は空文字列を返す', () => {
    const names: string[] = []

    const result = formatNamesForClipboard(names)

    expect(result).toBe('')
  })
})

describe('copyToClipboard', () => {
  beforeEach(() => {
    // navigator.clipboard.writeTextをモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('クリップボードにセミコロン区切りでコピー', async () => {
    const names = ['山田 太郎', '佐藤 一郎']

    const result = await copyToClipboard(names)

    expect(result).toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('山田 太郎;佐藤 一郎')
  })

  it('コピー失敗時はfalseを返す', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Failed'))

    const names = ['山田 太郎']

    const result = await copyToClipboard(names)

    expect(result).toBe(false)
  })

  it('空配列でも正常に動作', async () => {
    const names: string[] = []

    const result = await copyToClipboard(names)

    expect(result).toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('')
  })
})
