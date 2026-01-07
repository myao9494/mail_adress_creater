/**
 * CSVパーサーのテスト
 * 期待動作:
 * - CSV文字列をパースしてRecipient配列を返す
 * - 回数の降順でソートされる
 * - ヘッダー行はスキップされる
 */
import { describe, it, expect } from 'vitest'
import { parseCSV } from './csvParser'

describe('parseCSV', () => {
  it('CSV文字列をパースしてRecipient配列を返す', () => {
    const csvText = `名前,回数
山田 太郎,120
佐藤 一郎,200`

    const result = parseCSV(csvText)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: '佐藤 一郎', count: 200 })
    expect(result[1]).toEqual({ name: '山田 太郎', count: 120 })
  })

  it('回数の降順でソートされる', () => {
    const csvText = `名前,回数
伊藤 健,30
佐藤 一郎,200
山田 太郎,120`

    const result = parseCSV(csvText)

    expect(result[0].count).toBe(200)
    expect(result[1].count).toBe(120)
    expect(result[2].count).toBe(30)
  })

  it('空のCSVは空配列を返す', () => {
    const csvText = `名前,回数`

    const result = parseCSV(csvText)

    expect(result).toHaveLength(0)
  })

  it('括弧付きの名前も正しくパースする', () => {
    const csvText = `名前,回数
鈴木 恒一（開発）,40`

    const result = parseCSV(csvText)

    expect(result[0].name).toBe('鈴木 恒一（開発）')
  })

  it('空行は無視される', () => {
    const csvText = `名前,回数
山田 太郎,120

佐藤 一郎,200
`

    const result = parseCSV(csvText)

    expect(result).toHaveLength(2)
  })
})
