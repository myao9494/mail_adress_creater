/**
 * Outlook宛先作成アプリのメインコンポーネント
 * 2ペイン構成で宛先(To)とCCを独立して管理する
 *
 * キーボードナビゲーション:
 * - 左右矢印: ペイン間の移動
 * - 上下矢印: ペイン内のアイテム移動
 */
import { useState, useCallback, useEffect } from 'react'
import { useRecipients } from './hooks/useRecipients'
import { RecipientPane } from './components/RecipientPane'
import { Toast } from './components/Toast'
import {
  DEFAULT_SETTINGS,
  checkKeywords,
  loadSettings,
  refreshAddresses,
  saveSettings,
  type BackendSettings,
  type KeywordMatch,
} from './utils/api'

type FocusedPane = 'left' | 'right'

const formatKeywordText = (keywords: string[]) => keywords.join(',')

const parseKeywordText = (text: string) =>
  text.split(/[,\n\r、]+/).map(keyword => keyword.trim()).filter(Boolean)

function App() {
  const { recipients, loading, error, reload } = useRecipients()
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [focusedPane, setFocusedPane] = useState<FocusedPane>('left')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settings, setSettings] = useState<BackendSettings>(DEFAULT_SETTINGS)
  const [keywordText, setKeywordText] = useState(formatKeywordText(DEFAULT_SETTINGS.keywords))
  const [newMatches, setNewMatches] = useState<KeywordMatch[]>([])
  const [operationError, setOperationError] = useState<string | null>(null)
  const [runningAction, setRunningAction] = useState<'addresses' | 'keywords' | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    setToastVisible(true)
  }, [])

  const hideToast = useCallback(() => {
    setToastVisible(false)
  }, [])

  useEffect(() => {
    loadSettings()
      .then(nextSettings => {
        setSettings(nextSettings)
        setKeywordText(formatKeywordText(nextSettings.keywords))
      })
      .catch(err => {
        setOperationError(err instanceof Error ? err.message : '設定の読み込みに失敗しました')
      })
  }, [])

  const handleRefreshAddresses = useCallback(async () => {
    setRunningAction('addresses')
    setOperationError(null)
    try {
      const result = await refreshAddresses()
      await reload()
      showToast(`アドレスを再取得しました（保存 ${result.saved_count}件 / 0回 ${result.zero_count}件）`)
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'アドレス再取得に失敗しました')
    } finally {
      setRunningAction(null)
    }
  }, [reload, showToast])

  const handleCheckKeywords = useCallback(async () => {
    setRunningAction('keywords')
    setOperationError(null)
    try {
      const result = await checkKeywords()
      setNewMatches(result.new_matches)
      if (result.new_matches.length > 0) {
        showToast(`新しい職アド通知が ${result.new_matches.length}件あります`)
      } else {
        showToast('新しい職アド通知はありません')
      }
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : '職アドキーワードチェックに失敗しました')
    } finally {
      setRunningAction(null)
    }
  }, [showToast])

  const handleSaveSettings = useCallback(async () => {
    setOperationError(null)
    const nextSettings: BackendSettings = {
      keywords: parseKeywordText(keywordText),
      address_interval_minutes: settings.address_interval_minutes,
      keyword_interval_minutes: settings.keyword_interval_minutes,
    }
    try {
      const savedSettings = await saveSettings(nextSettings)
      setSettings(savedSettings)
      setKeywordText(formatKeywordText(savedSettings.keywords))
      showToast('設定を保存しました')
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : '設定の保存に失敗しました')
    }
  }, [keywordText, settings.address_interval_minutes, settings.keyword_interval_minutes, showToast])

  // グローバルキーボードイベント（左右矢印でペイン切替）
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 入力フィールドにフォーカスがある場合は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // 左矢印: 右ペイン → 左ペイン
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedPane('left')
      }
      // 右矢印: 左ペイン → 右ペイン
      else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedPane('right')
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          読み込み中...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 flex items-center justify-center">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          エラー: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 p-2 flex flex-col gap-2">
      {/* 上部メニュー */}
      <header className="shrink-0 bg-gray-950/70 border border-gray-700/60 rounded-lg px-2 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen(prev => !prev)}
            className="w-9 h-9 grid place-items-center rounded border border-gray-600/70 bg-gray-900/80 text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            aria-label="設定メニュー"
            aria-expanded={menuOpen}
          >
            <span className="flex flex-col gap-1" aria-hidden="true">
              <span className="block w-4 h-0.5 bg-current rounded" />
              <span className="block w-4 h-0.5 bg-current rounded" />
              <span className="block w-4 h-0.5 bg-current rounded" />
            </span>
          </button>
          <div className="min-w-0 mr-auto">
            <h1 className="text-sm font-semibold text-gray-100">Outlook宛先作成</h1>
            <p className="text-[10px] text-gray-400">送信履歴と職アド通知を管理</p>
          </div>
          <button
            type="button"
            onClick={handleRefreshAddresses}
            disabled={runningAction !== null}
            className="px-3 py-2 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-wait"
          >
            {runningAction === 'addresses' ? '取得中...' : 'アドレス再取得'}
          </button>
          <button
            type="button"
            onClick={handleCheckKeywords}
            disabled={runningAction !== null}
            className="px-3 py-2 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-wait"
          >
            {runningAction === 'keywords' ? '確認中...' : '職アドキーワードチェック'}
          </button>
        </div>
        {menuOpen && (
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_220px_220px_auto] bg-gray-900/80 border border-gray-700/60 rounded p-2">
            <label className="flex flex-col gap-1 text-[11px] text-gray-300">
              キーワード
              <input
                type="text"
                value={keywordText}
                onChange={e => setKeywordText(e.target.value)}
                placeholder="棚卸,棚おろし,ユーザID"
                className="px-2 py-2 rounded bg-gray-950/80 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500/70"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-gray-300">
              アドレス再取得の頻度（分）
              <input
                type="number"
                min={1}
                value={settings.address_interval_minutes}
                onChange={e => setSettings(prev => ({ ...prev, address_interval_minutes: Number(e.target.value) || 1 }))}
                className="px-2 py-2 rounded bg-gray-950/80 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500/70"
              />
              <span className="text-[10px] text-gray-500">既定値: 43200分（1ヶ月）</span>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-gray-300">
              キーワードチェックの頻度（分）
              <input
                type="number"
                min={1}
                value={settings.keyword_interval_minutes}
                onChange={e => setSettings(prev => ({ ...prev, keyword_interval_minutes: Number(e.target.value) || 1 }))}
                className="px-2 py-2 rounded bg-gray-950/80 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500/70"
              />
              <span className="text-[10px] text-gray-500">既定値: 60分（1時間）</span>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSaveSettings}
                className="w-full px-3 py-2 rounded bg-gray-100 text-gray-950 text-xs font-semibold hover:bg-white"
              >
                設定保存
              </button>
            </div>
          </div>
        )}
      </header>

      {operationError && (
        <div className="shrink-0 bg-red-500/15 border border-red-400/40 rounded-lg px-3 py-2 text-sm text-red-100">
          エラー: {operationError}
        </div>
      )}

      {newMatches.length > 0 && (
        <section className="shrink-0 bg-amber-300 text-gray-950 border-2 border-amber-100 rounded-lg p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">新しい職アド通知があります</h2>
              <p className="text-xs text-gray-800">{newMatches.length}件のキーワード一致を検出しました</p>
            </div>
            <button
              type="button"
              onClick={() => setNewMatches([])}
              className="px-2 py-1 rounded bg-gray-950 text-white text-xs hover:bg-gray-800"
            >
              閉じる
            </button>
          </div>
          <ul className="mt-2 max-h-28 overflow-y-auto text-xs divide-y divide-amber-500/40">
            {newMatches.map((match, index) => (
              <li key={`${match.received_time}-${match.keyword}-${index}`} className="py-1">
                <span className="font-semibold">[{match.keyword}]</span> {match.line}
                <span className="block text-[10px] text-gray-700">{match.received_time} / {match.subject}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2ペイン */}
      <div className="flex gap-2 min-h-0 flex-1">
        {/* 宛先（To）ペイン */}
        <div className="flex-1 min-w-0">
          <RecipientPane
            title="宛先（To）"
            buttonLabel="宛先作成"
            recipients={recipients}
            onCopySuccess={() => showToast('宛先をコピーしました')}
            onNameCopy={(name) => showToast(`${name} をコピーしました`)}
            isFocused={focusedPane === 'left'}
            onFocus={() => setFocusedPane('left')}
          />
        </div>

        {/* CCペイン */}
        <div className="flex-1 min-w-0">
          <RecipientPane
            title="CC"
            buttonLabel="CC作成"
            recipients={recipients}
            onCopySuccess={() => showToast('CCをコピーしました')}
            onNameCopy={(name) => showToast(`${name} をコピーしました`)}
            isFocused={focusedPane === 'right'}
            onFocus={() => setFocusedPane('right')}
          />
        </div>
      </div>

      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} />
    </div>
  )
}

export default App
