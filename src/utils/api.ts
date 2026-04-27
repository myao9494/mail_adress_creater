/**
 * バックエンドAPIとの通信ユーティリティ
 */
export type BackendSettings = {
  keywords: string[]
  address_interval_minutes: number
  keyword_interval_minutes: number
}

export type KeywordMatch = {
  received_time: string
  subject: string
  line: string
  keyword: string
  is_new: boolean
}

export type KeywordCheckResult = {
  matches: KeywordMatch[]
  new_matches: KeywordMatch[]
  keywords: string[]
}

export const DEFAULT_SETTINGS: BackendSettings = {
  keywords: ['棚卸', '棚おろし', 'ユーザID'],
  address_interval_minutes: 43200,
  keyword_interval_minutes: 60,
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'バックエンド処理に失敗しました')
  }
  return payload as T
}

export async function loadSettings(): Promise<BackendSettings> {
  return requestJson<BackendSettings>('/api/settings')
}

export async function saveSettings(settings: BackendSettings): Promise<BackendSettings> {
  return requestJson<BackendSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function refreshAddresses(): Promise<{ saved_count: number; zero_count: number }> {
  return requestJson<{ saved_count: number; zero_count: number }>('/api/refresh-addresses', {
    method: 'POST',
    body: JSON.stringify({ limit: 150 }),
  })
}

export async function checkKeywords(): Promise<KeywordCheckResult> {
  return requestJson<KeywordCheckResult>('/api/check-keywords', {
    method: 'POST',
    body: JSON.stringify({ limit: 500 }),
  })
}
