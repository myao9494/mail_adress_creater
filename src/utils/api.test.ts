/**
 * バックエンドAPIユーティリティのテスト
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkKeywords, loadSettings, saveSettings } from './api'

describe('api utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('設定を読み込む', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        keywords: ['棚卸'],
        address_interval_minutes: 43200,
        keyword_interval_minutes: 60,
      }),
    }))

    await expect(loadSettings()).resolves.toEqual({
      keywords: ['棚卸'],
      address_interval_minutes: 43200,
      keyword_interval_minutes: 60,
    })
  })

  it('設定を保存する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        keywords: ['ユーザID'],
        address_interval_minutes: 10,
        keyword_interval_minutes: 20,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await saveSettings({
      keywords: ['ユーザID'],
      address_interval_minutes: 10,
      keyword_interval_minutes: 20,
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        keywords: ['ユーザID'],
        address_interval_minutes: 10,
        keyword_interval_minutes: 20,
      }),
    }))
  })

  it('APIエラーを例外として返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Outlook連携エラー' }),
    }))

    await expect(checkKeywords()).rejects.toThrow('Outlook連携エラー')
  })
})
