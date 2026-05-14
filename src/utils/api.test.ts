/**
 * バックエンドAPIユーティリティのテスト
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkKeywords, deleteDatabaseRecords, loadDatabase, loadSettings, saveSettings, seedDummyData } from './api'

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

  it('DBスナップショットを読み込む', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        settings: [],
        recipients: [{ name: '山田 太郎', count: 12, updated_at: '2026-05-14T00:00:00+00:00' }],
        keyword_matches: [],
        job_runs: [],
      }),
    }))

    await expect(loadDatabase()).resolves.toEqual(expect.objectContaining({
      recipients: [expect.objectContaining({ name: '山田 太郎', count: 12 })],
    }))
  })

  it('ダミーデータ投入APIを呼び出す', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        inserted: { recipients: 4, keyword_matches: 3, job_runs: 2 },
        database: { settings: [], recipients: [], keyword_matches: [], job_runs: [] },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await seedDummyData()

    expect(fetchMock).toHaveBeenCalledWith('/api/seed-dummy-data', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('選択したDBレコード削除APIを呼び出す', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: { table: 'recipients', deleted: 1 },
        database: { settings: [], recipients: [], keyword_matches: [], job_runs: [] },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await deleteDatabaseRecords('recipients', ['山田 太郎'])

    expect(fetchMock).toHaveBeenCalledWith('/api/database/delete', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ table: 'recipients', keys: ['山田 太郎'] }),
    }))
  })
})
