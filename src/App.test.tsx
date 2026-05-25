/**
 * Appコンポーネントのテスト
 * 職アドチェック通知の確認機能などをテストする
 **/
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { loadUnconfirmedMatches, confirmMatches } from './utils/api'

// apiモジュールの関数をモックする
vi.mock('./utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/api')>()
  return {
    ...actual,
    loadUnconfirmedMatches: vi.fn(),
    confirmMatches: vi.fn(),
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

    expect(screen.getByText('[棚卸] テスト')).toBeInTheDocument()

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
})
