/**
 * Appコンポーネントのテスト
 * 職アドチェック通知の確認機能などをテストする
 **/
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { loadUnconfirmedMatches, confirmMatches, parseSchedule, addSchedule } from './utils/api'

// apiモジュールの関数をモックする
vi.mock('./utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/api')>()
  return {
    ...actual,
    loadUnconfirmedMatches: vi.fn(),
    confirmMatches: vi.fn(),
    parseSchedule: vi.fn(),
    addSchedule: vi.fn(),
    loadSettings: vi.fn().mockResolvedValue({ keywords: ['棚卸'], address_interval_minutes: 60, keyword_interval_minutes: 60 }),
    loadFavorites: vi.fn().mockResolvedValue({ favorites: [] }),
    loadDatabase: vi.fn().mockResolvedValue({}),
  }
})

// hooksのモック
vi.mock('./hooks/useRecipients', () => ({
  useRecipients: () => ({
    recipients: [],
    loading: false,
    error: null,
    reload: vi.fn().mockResolvedValue(undefined),
  })
}))

describe('App - 職アド通知確認', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未確認の職アド通知がある場合、確認ボタンを押すことで確認完了となり通知が消える', async () => {
    const mockMatches = [
      {
        id: 42,
        received_time: '2026-05-18T10:00:00',
        subject: '職アドからのお知らせ',
        line: 'テスト',
        keyword: '棚卸',
        is_new: false,
        confirmed: false,
      },
    ]

    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: mockMatches })
    vi.mocked(confirmMatches).mockResolvedValue({ updated: 1 })

    render(<App />)

    // 起動時のローディング終了・メッセージの表示を待つ
    await waitFor(() => {
      expect(screen.getByText('新しい職アド通知があります')).toBeInTheDocument()
    })

    expect(screen.getByText(/棚卸/)).toBeInTheDocument()
    expect(screen.getByText(/テスト/)).toBeInTheDocument()

    // 「確認」ボタン（OKボタン）が存在することを確認
    const confirmButton = screen.getByRole('button', { name: '確認' })
    expect(confirmButton).toBeInTheDocument()

    // ボタンをクリック
    fireEvent.click(confirmButton)

    // confirmMatches APIが正しいIDで呼び出されたことを確認
    await waitFor(() => {
      expect(confirmMatches).toHaveBeenCalledWith([42])
    })

    // バナーが消えたことを確認
    await waitFor(() => {
      expect(screen.queryByText('新しい職アド通知があります')).not.toBeInTheDocument()
    })
  })

  it('予定本文のHTML貼り付けをサポートし、Outlook追加時に正しくAPIへ渡されること', async () => {
    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: [] })

    const mockEvent = {
      start: '2026-05-20T15:00+09:00',
      end: '2026-05-20T16:30+09:00',
      subject: 'テスト会議',
      location: '会議室A',
      body: '',
      all_day: false,
      duration_minutes: 90,
      normalized_text: '今週の水曜日 15:00から16:30 テスト会議 @ 会議室A',
    }

    vi.mocked(parseSchedule).mockResolvedValue({ event: mockEvent })
    vi.mocked(addSchedule).mockResolvedValue({ event: { ...mockEvent, body: '<p>議題：進捗確認 <a href="http://example.com">資料リンク</a></p>' }, saved: true })

    render(<App />)

    // 予定解析用の入力欄に入力してEnterまたは解析ボタンクリック
    const input = screen.getByPlaceholderText('例: 今週の水曜日 15:00から16:30 調整会議')
    fireEvent.change(input, { target: { value: '今週の水曜日 15:00から16:30 テスト会議 @ 会議室A' } })

    const parseButton = screen.getByRole('button', { name: '予定解析' })
    fireEvent.click(parseButton)

    // 予定解析APIの呼び出しを確認
    await waitFor(() => {
      expect(parseSchedule).toHaveBeenCalledWith('今週の水曜日 15:00から16:30 テスト会議 @ 会議室A')
    })

    // 解析後、編集エリアが表示され、「本文」の編集欄が存在することを確認
    await waitFor(() => {
      expect(screen.getByText('件名')).toBeInTheDocument()
    })

    // ラベル「本文」に関連付けられた要素を取得する
    const bodyLabel = screen.getByText('本文')
    const editableDiv = bodyLabel.parentElement?.querySelector('[contenteditable="true"]')
    expect(editableDiv).toBeInTheDocument()

    // HTMLのペースト/編集をシミュレートする
    if (editableDiv) {
      editableDiv.innerHTML = '<p>議題：進捗確認 <a href="http://example.com">資料リンク</a></p>'
      fireEvent.blur(editableDiv)
    }

    // 「Outlook追加」ボタンをクリック
    const addButton = screen.getByRole('button', { name: 'Outlook追加' })
    fireEvent.click(addButton)

    // addSchedule APIがHTMLを含む正しいパラメータで呼び出されたことを確認
    await waitFor(() => {
      expect(addSchedule).toHaveBeenCalledWith(
        '今週の水曜日 15:00から16:30 テスト会議 @ 会議室A',
        expect.objectContaining({
          body: '<p>議題：進捗確認 <a href="http://example.com">資料リンク</a></p>',
          subject: 'テスト会議',
        })
      )
    })
  })
})
