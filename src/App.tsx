/**
 * Outlook宛先作成アプリのメインコンポーネント
 * 2ペイン構成で宛先(To)とCCを独立して管理する
 *
 * キーボードナビゲーション:
 * - 左右矢印: ペイン間の移動
/**
 * Outlook宛先作成アプリのメインコンポーネント
 * 2ペイン構成で宛先(To)とCCを独立して管理する
 *
 * キーボードナビゲーション:
 * - 左右矢印: ペイン間の移動
 * - 上下矢印: ペイン内のアイテム移動
 */
import { useState, useCallback, useEffect, useMemo, type WheelEvent } from 'react'
import { useRecipients } from './hooks/useRecipients'
import { RecipientPane } from './components/RecipientPane'
import { Toast } from './components/Toast'
import {
  DEFAULT_SETTINGS,
  addFavorite,
  addSchedule,
  checkKeywords,
  confirmMatches,
  deleteDatabaseRecords,
  loadFavorites,
  loadDatabase,
  loadSettings,
  loadUnconfirmedMatches,
  parseSchedule,
  refreshAddresses,
  saveFavorites,
  saveSettings,
  seedDummyData,
  type BackendSettings,
  type DatabaseSnapshot,
  type Favorite,
  type KeywordMatch,
  type ParsedScheduleEvent,
} from './utils/api'
import type { Recipient } from './types'

type FocusedPane = 'left' | 'right'
type DatabaseTableName = keyof DatabaseSnapshot
type DeletableDatabaseTableName = Exclude<DatabaseTableName, 'settings'>

const formatKeywordText = (keywords: string[]) => keywords.join(',')

const parseKeywordText = (text: string) =>
  text.split(/[,\n\r、]+/).map(keyword => keyword.trim()).filter(Boolean)

const formatFavoriteAddressText = (addresses: string[]) => addresses.join('\n')

const parseFavoriteAddressText = (text: string) =>
  text.split(/[\n\r;、,]+/).map(address => address.trim()).filter(Boolean)

const normalizeFavoriteName = (name: string) => name.replace(/^★\s*/, '').trim()

const toDateTimeLocalValue = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const toIsoFromDateTimeLocal = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

const nextAllDayEnd = (start: string) => {
  const date = new Date(start)
  if (Number.isNaN(date.getTime())) {
    return start
  }
  date.setDate(date.getDate() + 1)
  return date.toISOString()
}

const adjustIsoMinutes = (value: string, deltaMinutes: number) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  date.setMinutes(date.getMinutes() + deltaMinutes)
  return date.toISOString()
}

const expandFavoriteAddresses = (
  name: string,
  favoriteMap: Map<string, string[]>,
  expandingNames = new Set<string>(),
): string[] => {
  const normalizedName = normalizeFavoriteName(name)
  const addresses = favoriteMap.get(normalizedName)
  if (!addresses) {
    return [name]
  }
  if (expandingNames.has(normalizedName)) {
    return [normalizedName]
  }

  const nextExpandingNames = new Set(expandingNames)
  nextExpandingNames.add(normalizedName)
  return addresses.flatMap(address => expandFavoriteAddresses(address, favoriteMap, nextExpandingNames))
}

function App() {
  const { recipients, loading, error, reload } = useRecipients()
  const [favoriteModalOpen, setFavoriteModalOpen] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [focusedPane, setFocusedPane] = useState<FocusedPane>('left')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settings, setSettings] = useState<BackendSettings>(DEFAULT_SETTINGS)
  const [keywordText, setKeywordText] = useState(formatKeywordText(DEFAULT_SETTINGS.keywords))
  const [newMatches, setNewMatches] = useState<KeywordMatch[]>([])
  const [operationError, setOperationError] = useState<string | null>(null)
  const [runningAction, setRunningAction] = useState<'addresses' | 'keywords' | 'database' | 'dummy' | 'schedule' | null>(null)
  const [databaseOpen, setDatabaseOpen] = useState(false)
  const [database, setDatabase] = useState<DatabaseSnapshot | null>(null)
  const [databaseTable, setDatabaseTable] = useState<DatabaseTableName>('keyword_matches')
  const [selectedDatabaseKeys, setSelectedDatabaseKeys] = useState<string[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [selectedFavoriteName, setSelectedFavoriteName] = useState('')
  const [favoriteNameDraft, setFavoriteNameDraft] = useState('')
  const [favoriteAddressText, setFavoriteAddressText] = useState('')
  const [scheduleText, setScheduleText] = useState('')
  const [parsedSchedule, setParsedSchedule] = useState<ParsedScheduleEvent | null>(null)

  const searchableRecipients = useMemo<Recipient[]>(() => {
    const favoriteMap = new Map(favorites.map(favorite => [favorite.name, favorite.addresses]))
    return [
      ...favorites.map(favorite => ({
        name: `★ ${favorite.name}`,
        count: favorite.addresses.length,
        copyNames: expandFavoriteAddresses(favorite.name, favoriteMap),
        favorite: true,
      })),
      ...recipients,
    ]
  }, [favorites, recipients])

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

  // アプリ起動時に未確認の職アド通知を読み込む
  useEffect(() => {
    loadUnconfirmedMatches()
      .then(result => {
        if (result.matches.length > 0) {
          setNewMatches(result.matches)
        }
      })
      .catch(() => {
        // 読み込みエラーは無視（バックエンドが起動していない場合など）
      })
  }, [])

  useEffect(() => {
    loadFavorites()
      .then(result => {
        setFavorites(result.favorites)
        const firstFavorite = result.favorites[0]
        if (firstFavorite) {
          setSelectedFavoriteName(firstFavorite.name)
          setFavoriteNameDraft(firstFavorite.name)
          setFavoriteAddressText(formatFavoriteAddressText(firstFavorite.addresses))
        }
      })
      .catch(err => {
        setOperationError(err instanceof Error ? err.message : 'お気に入りの読み込みに失敗しました')
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

  const handleConfirmMatches = useCallback(async () => {
    const ids = newMatches.map(match => match.id).filter((id): id is number => id !== undefined)
    if (ids.length === 0) {
      setNewMatches([])
      return
    }
    setOperationError(null)
    try {
      await confirmMatches(ids)
      setNewMatches([])
      showToast('職アド通知を確認済みにしました')
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : '職アド通知の確認に失敗しました')
    }
  }, [newMatches, showToast])

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

  const handleLoadDatabase = useCallback(async () => {
    setRunningAction('database')
    setOperationError(null)
    try {
      const snapshot = await loadDatabase()
      setDatabase(snapshot)
      setDatabaseOpen(true)
      setSelectedDatabaseKeys([])
      showToast('DBを読み込みました')
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'DBの読み込みに失敗しました')
    } finally {
      setRunningAction(null)
    }
  }, [showToast])

  const handleParseSchedule = useCallback(async () => {
    const text = scheduleText.trim()
    if (!text) {
      setOperationError('予定入力を入力してください')
      return
    }
    setRunningAction('schedule')
    setOperationError(null)
    try {
      const result = await parseSchedule(text)
      setParsedSchedule(result.event)
      showToast('予定を解析しました')
    } catch (err) {
      setParsedSchedule(null)
      setOperationError(err instanceof Error ? err.message : '予定の解析に失敗しました')
    } finally {
      setRunningAction(null)
    }
  }, [scheduleText, showToast])

  const handleUpdateParsedSchedule = useCallback((updates: Partial<ParsedScheduleEvent>) => {
    setParsedSchedule(prev => {
      if (!prev) {
        return prev
      }
      const next = { ...prev, ...updates }
      if (updates.all_day === true) {
        next.start = toIsoFromDateTimeLocal(`${toDateTimeLocalValue(next.start).slice(0, 10)}T00:00`)
        next.end = nextAllDayEnd(next.start)
        next.duration_minutes = 1440
      } else if (next.all_day && updates.start) {
        next.start = toIsoFromDateTimeLocal(`${toDateTimeLocalValue(next.start).slice(0, 10)}T00:00`)
        next.end = nextAllDayEnd(next.start)
        next.duration_minutes = 1440
      } else if (updates.start || updates.end) {
        const startTime = new Date(next.start).getTime()
        const endTime = new Date(next.end).getTime()
        if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime > startTime) {
          next.duration_minutes = Math.max(1, Math.round((endTime - startTime) / 60000))
        }
      }
      return next
    })
  }, [])

  const handleScheduleTimeWheel = useCallback((
    event: WheelEvent<HTMLInputElement>,
    field: 'start' | 'end',
  ) => {
    if (!parsedSchedule || (field === 'end' && parsedSchedule.all_day)) {
      return
    }
    event.preventDefault()
    const deltaMinutes = event.deltaY < 0 ? 5 : -5
    handleUpdateParsedSchedule({ [field]: adjustIsoMinutes(parsedSchedule[field], deltaMinutes) })
  }, [handleUpdateParsedSchedule, parsedSchedule])

  const handleAddSchedule = useCallback(async () => {
    const text = scheduleText.trim()
    if (!text && !parsedSchedule) {
      setOperationError('予定入力を入力してください')
      return
    }
    if (!parsedSchedule) {
      setOperationError('先に予定解析を実行してください')
      return
    }
    if (!parsedSchedule.subject.trim()) {
      setOperationError('件名を入力してください')
      return
    }
    setRunningAction('schedule')
    setOperationError(null)
    try {
      const result = await addSchedule(text, parsedSchedule)
      setParsedSchedule(result.event)
      showToast(`${result.event.subject} をOutlook予定表に追加しました`)
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'Outlook予定表への追加に失敗しました')
    } finally {
      setRunningAction(null)
    }
  }, [parsedSchedule, scheduleText, showToast])

  const handleSeedDummyData = useCallback(async () => {
    setRunningAction('dummy')
    setOperationError(null)
    try {
      const result = await seedDummyData()
      setDatabase(result.database)
      setDatabaseOpen(true)
      setSelectedDatabaseKeys([])
      await reload()
      showToast(`ダミーデータを投入しました（宛先 ${result.inserted.recipients}件）`)
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'ダミーデータ投入に失敗しました')
    } finally {
      setRunningAction(null)
    }
  }, [reload, showToast])

  const handleDeleteDatabaseRows = useCallback(async () => {
    if (databaseTable === 'settings' || selectedDatabaseKeys.length === 0) {
      return
    }
    const confirmed = window.confirm(`${databaseTable} の選択レコード ${selectedDatabaseKeys.length}件を削除します。よろしいですか？`)
    if (!confirmed) {
      return
    }

    setRunningAction('database')
    setOperationError(null)
    try {
      const result = await deleteDatabaseRecords(databaseTable as DeletableDatabaseTableName, selectedDatabaseKeys)
      setDatabase(result.database)
      if (databaseTable === 'favorites') {
        setFavorites(result.database.favorites)
        const nextSelected = result.database.favorites.find(favorite => favorite.name === selectedFavoriteName) ?? result.database.favorites[0]
        setSelectedFavoriteName(nextSelected?.name ?? '')
        setFavoriteNameDraft(nextSelected?.name ?? '')
        setFavoriteAddressText(formatFavoriteAddressText(nextSelected?.addresses ?? []))
      }
      setSelectedDatabaseKeys([])
      await reload()
      showToast(`${result.result.deleted}件を削除しました`)
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'DBレコード削除に失敗しました')
    } finally {
      setRunningAction(null)
    }
  }, [databaseTable, reload, selectedDatabaseKeys, selectedFavoriteName, showToast])

  const handleSelectFavorite = useCallback((favorite: Favorite) => {
    setSelectedFavoriteName(favorite.name)
    setFavoriteNameDraft(favorite.name)
    setFavoriteAddressText(formatFavoriteAddressText(favorite.addresses))
  }, [])

  const handleCreateFavorite = useCallback(() => {
    let index = favorites.length + 1
    let name = `新しいお気に入り${index}`
    while (favorites.some(favorite => favorite.name === name)) {
      index += 1
      name = `新しいお気に入り${index}`
    }
    setSelectedFavoriteName('')
    setFavoriteNameDraft(name)
    setFavoriteAddressText('')
  }, [favorites])

  const handleSaveSelectedFavorite = useCallback(async () => {
    setOperationError(null)
    const name = favoriteNameDraft.trim()
    const addresses = parseFavoriteAddressText(favoriteAddressText)
    if (!name) {
      setOperationError('お気に入り名を入力してください')
      return
    }
    if (addresses.length === 0) {
      setOperationError('お気に入りの内容を入力してください')
      return
    }
    try {
      const nextFavorites = [
        ...favorites.filter(favorite => favorite.name !== selectedFavoriteName && favorite.name !== name),
        { name, addresses },
      ]
      const result = await saveFavorites(nextFavorites)
      setFavorites(result.favorites)
      const savedFavorite = result.favorites.find(favorite => favorite.name === name)
      setSelectedFavoriteName(savedFavorite?.name ?? name)
      setFavoriteNameDraft(savedFavorite?.name ?? name)
      setFavoriteAddressText(formatFavoriteAddressText(savedFavorite?.addresses ?? addresses))
      showToast('お気に入りを保存しました')
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'お気に入りの保存に失敗しました')
    }
  }, [favoriteAddressText, favoriteNameDraft, favorites, selectedFavoriteName, showToast])

  const handleDeleteSelectedFavorite = useCallback(async () => {
    if (!selectedFavoriteName) {
      setFavoriteNameDraft('')
      setFavoriteAddressText('')
      return
    }
    const confirmed = window.confirm(`${selectedFavoriteName} を削除します。よろしいですか？`)
    if (!confirmed) {
      return
    }
    setOperationError(null)
    try {
      const result = await saveFavorites(favorites.filter(favorite => favorite.name !== selectedFavoriteName))
      setFavorites(result.favorites)
      const nextFavorite = result.favorites[0]
      setSelectedFavoriteName(nextFavorite?.name ?? '')
      setFavoriteNameDraft(nextFavorite?.name ?? '')
      setFavoriteAddressText(formatFavoriteAddressText(nextFavorite?.addresses ?? []))
      showToast('お気に入りを削除しました')
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'お気に入りの削除に失敗しました')
    }
  }, [favorites, selectedFavoriteName, showToast])

  const handleAddFavorite = useCallback(async (recipientName: string) => {
    const cleanName = recipientName.replace(/^★\s*/, '')
    const favoriteName = window.prompt('お気に入り名', cleanName)
    if (!favoriteName) {
      return
    }
    setOperationError(null)
    try {
      const result = await addFavorite(favoriteName, [cleanName])
      setFavorites(result.favorites)
      setSelectedFavoriteName(result.favorite.name)
      setFavoriteNameDraft(result.favorite.name)
      setFavoriteAddressText(formatFavoriteAddressText(result.favorite.addresses))
      showToast(`${result.favorite.name} をお気に入りに追加しました`)
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'お気に入り追加に失敗しました')
    }
  }, [showToast])

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

  useEffect(() => {
    if (!favoriteModalOpen) {
      return
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFavoriteModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [favoriteModalOpen])

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

  const selectedFavorite = favorites.find(favorite => favorite.name === selectedFavoriteName)
  const draftAddresses = parseFavoriteAddressText(favoriteAddressText)
  const parsedScheduleStartValue = parsedSchedule ? toDateTimeLocalValue(parsedSchedule.start) : ''
  const parsedScheduleEndValue = parsedSchedule ? toDateTimeLocalValue(parsedSchedule.end) : ''

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
          <button
            type="button"
            onClick={handleLoadDatabase}
            disabled={runningAction !== null}
            className="px-3 py-2 rounded bg-slate-700 text-white text-xs font-medium hover:bg-slate-600 disabled:bg-gray-600 disabled:cursor-wait"
          >
            {runningAction === 'database' ? '読込中...' : 'DB表示'}
          </button>
          <button
            type="button"
            onClick={() => setFavoriteModalOpen(true)}
            className="px-3 py-2 rounded bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-500"
          >
            お気に入り
          </button>
        </div>
        {menuOpen && (
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_220px_220px_auto_auto] bg-gray-900/80 border border-gray-700/60 rounded p-2">
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
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSeedDummyData}
                disabled={runningAction !== null}
                className="w-full px-3 py-2 rounded bg-amber-400 text-gray-950 text-xs font-semibold hover:bg-amber-300 disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-wait"
              >
                {runningAction === 'dummy' ? '投入中...' : 'ダミーデータ投入'}
              </button>
            </div>
          </div>
        )}
      </header>

      <section className="shrink-0 grid gap-2 bg-gray-950/55 border border-gray-700/60 rounded-lg p-2 md:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1 text-[11px] text-gray-300">
          予定を自然文で入力
          <input
            type="text"
            value={scheduleText}
            onChange={e => {
              setScheduleText(e.target.value)
              setParsedSchedule(null)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleParseSchedule()
              }
            }}
            placeholder="例: 今週の水曜日 15:00から16:30 調整会議"
            className="px-3 py-2 rounded bg-gray-950/80 border border-gray-700 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500/70"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={handleParseSchedule}
            disabled={runningAction !== null}
            className="px-3 py-2 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-wait"
          >
            {runningAction === 'schedule' ? '処理中...' : '予定解析'}
          </button>
          <button
            type="button"
            onClick={handleAddSchedule}
            disabled={runningAction !== null}
            className="px-3 py-2 rounded bg-rose-600 text-white text-xs font-medium hover:bg-rose-500 disabled:bg-gray-600 disabled:cursor-wait"
          >
            Outlook追加
          </button>
        </div>
        {parsedSchedule && (
          <div className="md:col-span-2 grid gap-2 rounded border border-indigo-400/30 bg-indigo-400/10 px-3 py-3 text-xs text-indigo-50 md:grid-cols-[1.2fr_180px_180px_1fr_1fr_80px]">
            <label className="flex min-w-0 flex-col gap-1 text-indigo-200">
              件名
              <input
                type="text"
                value={parsedSchedule.subject}
                onChange={e => handleUpdateParsedSchedule({ subject: e.target.value })}
                className="px-2 py-2 rounded bg-gray-950/80 border border-indigo-300/30 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex flex-col gap-1 text-indigo-200">
              開始
              <input
                type="datetime-local"
                value={parsedScheduleStartValue}
                step={300}
                onChange={e => handleUpdateParsedSchedule({ start: toIsoFromDateTimeLocal(e.target.value) })}
                onWheel={e => handleScheduleTimeWheel(e, 'start')}
                className="px-2 py-2 rounded bg-gray-950/80 border border-indigo-300/30 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex flex-col gap-1 text-indigo-200">
              終了
              <input
                type="datetime-local"
                value={parsedScheduleEndValue}
                step={300}
                onChange={e => handleUpdateParsedSchedule({ end: toIsoFromDateTimeLocal(e.target.value) })}
                onWheel={e => handleScheduleTimeWheel(e, 'end')}
                disabled={parsedSchedule.all_day}
                className="px-2 py-2 rounded bg-gray-950/80 border border-indigo-300/30 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-indigo-200">
              場所
              <input
                type="text"
                value={parsedSchedule.location}
                onChange={e => handleUpdateParsedSchedule({ location: e.target.value })}
                className="px-2 py-2 rounded bg-gray-950/80 border border-indigo-300/30 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-indigo-200">
              本文
              <textarea
                value={parsedSchedule.body}
                onChange={e => handleUpdateParsedSchedule({ body: e.target.value })}
                rows={1}
                className="min-h-[38px] resize-y px-2 py-2 rounded bg-gray-950/80 border border-indigo-300/30 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-indigo-100">
              <input
                type="checkbox"
                checked={parsedSchedule.all_day}
                onChange={e => handleUpdateParsedSchedule({ all_day: e.target.checked })}
                className="h-4 w-4 accent-indigo-500"
              />
              終日
            </label>
          </div>
        )}
      </section>

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
              onClick={handleConfirmMatches}
              className="px-2 py-1 rounded bg-gray-950 text-white text-xs hover:bg-gray-800"
            >
              確認
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

      {databaseOpen && database && (
        <div className="fixed inset-0 z-40 bg-black/70 p-3 md:p-5">
          <section className="h-full min-h-0 flex flex-col bg-gray-950 border border-gray-700/80 rounded-lg shadow-2xl">
            <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-gray-800 px-3 py-3">
              <div className="mr-auto">
                <h2 className="text-base font-semibold text-gray-100">DB閲覧</h2>
                <p className="text-[11px] text-gray-400">最新データを上に表示しています</p>
              </div>
              {(['keyword_matches', 'recipients', 'favorites', 'job_runs', 'settings'] as DatabaseTableName[]).map(table => (
                <button
                  key={table}
                  type="button"
                  onClick={() => {
                    setDatabaseTable(table)
                    setSelectedDatabaseKeys([])
                  }}
                  className={`px-3 py-2 rounded border text-xs ${
                    databaseTable === table
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {table} ({database[table].length})
                </button>
              ))}
              <button
                type="button"
                onClick={handleLoadDatabase}
                disabled={runningAction !== null}
                className="px-3 py-2 rounded bg-gray-800 text-xs text-gray-100 hover:bg-gray-700 disabled:cursor-wait"
              >
                更新
              </button>
              <button
                type="button"
                onClick={handleDeleteDatabaseRows}
                disabled={databaseTable === 'settings' || selectedDatabaseKeys.length === 0 || runningAction !== null}
                className="px-3 py-2 rounded bg-red-600 text-xs font-semibold text-white hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                選択削除 ({selectedDatabaseKeys.length})
              </button>
              <button
                type="button"
                onClick={() => setDatabaseOpen(false)}
                className="px-3 py-2 rounded bg-gray-100 text-xs font-semibold text-gray-950 hover:bg-white"
              >
                閉じる
              </button>
            </div>
            <DatabaseTable
              snapshot={database}
              table={databaseTable}
              selectedKeys={selectedDatabaseKeys}
              onSelectedKeysChange={setSelectedDatabaseKeys}
            />
          </section>
        </div>
      )}

      {/* 2ペイン */}
      <div className="flex gap-2 min-h-0 flex-1">
        {/* 宛先（To）ペイン */}
        <div className="flex-1 min-w-0">
          <RecipientPane
            title="宛先（To）"
            buttonLabel="宛先作成"
            recipients={searchableRecipients}
            onAddFavorite={handleAddFavorite}
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
            recipients={searchableRecipients}
            onAddFavorite={handleAddFavorite}
            onCopySuccess={() => showToast('CCをコピーしました')}
            onNameCopy={(name) => showToast(`${name} をコピーしました`)}
            isFocused={focusedPane === 'right'}
            onFocus={() => setFocusedPane('right')}
          />
        </div>
      </div>

      {favoriteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-3 md:p-5"
          onMouseDown={() => setFavoriteModalOpen(false)}
        >
          <section
            className="mx-auto flex h-full max-w-6xl flex-col border border-gray-700/80 bg-gray-950 text-gray-100 shadow-2xl"
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="shrink-0 border-b border-gray-800 bg-gray-950 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 mr-auto">
                  <h1 className="text-lg font-semibold text-gray-50">お気に入り</h1>
                  <p className="text-xs text-gray-400">左で名前を選択し、右で内容を編集</p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateFavorite}
                  className="h-9 px-4 rounded border border-gray-700 bg-gray-900 text-xs font-bold text-gray-100 hover:bg-gray-800"
                >
                  新規
                </button>
                <button
                  type="button"
                  onClick={handleSaveSelectedFavorite}
                  className="h-9 px-4 rounded bg-cyan-500 text-xs font-bold text-gray-950 hover:bg-cyan-400"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setFavoriteModalOpen(false)}
                  className="h-9 px-3 rounded bg-gray-100 text-xs font-bold text-gray-950 hover:bg-white"
                >
                  閉じる
                </button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="min-h-0 border border-gray-800 bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-800 px-3 py-3">
                  <h2 className="text-sm font-semibold text-gray-100">お気に入り名</h2>
                  <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">{favorites.length}件</span>
                </div>
                <div className="max-h-[calc(100vh-170px)] overflow-auto">
                  {favorites.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-gray-500">お気に入りがありません</p>
                  ) : favorites.map(favorite => (
                    <button
                      key={favorite.name}
                      type="button"
                      onClick={() => handleSelectFavorite(favorite)}
                      className={`block w-full border-b border-gray-800 px-3 py-3 text-left hover:bg-gray-800 ${
                        selectedFavoriteName === favorite.name ? 'bg-cyan-500/15 text-cyan-100' : 'text-gray-200'
                      }`}
                    >
                      <span className="block truncate text-sm font-semibold" title={favorite.name}>{favorite.name}</span>
                      <span className="mt-1 block text-xs text-gray-400">{favorite.addresses.length}宛先</span>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="min-h-0 border border-gray-800 bg-gray-900">
                <div className="grid gap-3 border-b border-gray-800 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="flex min-w-0 flex-col gap-1 text-xs text-gray-300">
                    お気に入り名
                    <input
                      type="text"
                      value={favoriteNameDraft}
                      onChange={event => setFavoriteNameDraft(event.target.value)}
                      className="h-10 rounded border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none focus:border-cyan-400"
                      placeholder="例: 開発チーム"
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteSelectedFavorite}
                      className="h-10 px-3 rounded bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <div className="border-b border-gray-800 px-3 py-2 text-xs text-gray-400">
                  {selectedFavorite ? `${selectedFavorite.name} を編集中` : '新しいお気に入りを編集中'} / {draftAddresses.length}宛先
                </div>
                <textarea
                  value={favoriteAddressText}
                  onChange={event => setFavoriteAddressText(event.target.value)}
                  spellCheck={false}
                  className="h-[calc(100vh-235px)] min-h-[360px] w-full resize-none bg-transparent p-4 font-mono text-sm leading-7 text-gray-100 outline-none placeholder:text-gray-600"
                  placeholder={'山田 太郎\n佐藤 一郎\nkeiri@example.com'}
                />
              </section>
            </div>
          </section>
        </div>
      )}

      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} />
    </div>
  )
}

function DatabaseTable({
  snapshot,
  table,
  selectedKeys,
  onSelectedKeysChange,
}: {
  snapshot: DatabaseSnapshot
  table: DatabaseTableName
  selectedKeys: string[]
  onSelectedKeysChange: (keys: string[]) => void
}) {
  const rows = snapshot[table]
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  const canDelete = table !== 'settings'
  const rowKeys = rows.map(row => getDatabaseRowKey(table, row))
  const selectedKeySet = new Set(selectedKeys)
  const allSelected = canDelete && rowKeys.length > 0 && rowKeys.every(key => selectedKeySet.has(key))

  const toggleAllRows = (checked: boolean) => {
    onSelectedKeysChange(checked ? rowKeys : [])
  }

  const toggleRow = (key: string, checked: boolean) => {
    if (checked) {
      onSelectedKeysChange([...selectedKeys, key])
      return
    }
    onSelectedKeysChange(selectedKeys.filter(selectedKey => selectedKey !== key))
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-gray-950">
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-gray-400">データがありません</div>
      ) : (
        <table className="w-full min-w-max text-left text-xs">
          <thead className="sticky top-0 bg-gray-900 text-gray-300">
            <tr>
              <th className="w-10 px-3 py-2 border-b border-gray-800">
                {canDelete && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={event => toggleAllRows(event.target.checked)}
                    className="h-4 w-4 accent-red-500"
                    aria-label="全レコードを選択"
                  />
                )}
              </th>
              {columns.map(column => (
                <th key={column} className="px-3 py-2 font-semibold whitespace-nowrap border-b border-gray-800">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-gray-200">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-900/80">
                <td className="px-3 py-2 align-top">
                  {canDelete && (
                    <input
                      type="checkbox"
                      checked={selectedKeySet.has(rowKeys[rowIndex])}
                      onChange={event => toggleRow(rowKeys[rowIndex], event.target.checked)}
                      className="h-4 w-4 accent-red-500"
                      aria-label={`${rowKeys[rowIndex]}を選択`}
                    />
                  )}
                </td>
                {columns.map(column => (
                  <td key={column} className="px-3 py-2 align-top max-w-[720px]">
                    <span className="block whitespace-pre-wrap break-words" title={String(row[column as keyof typeof row])}>
                      {String(row[column as keyof typeof row])}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function getDatabaseRowKey(table: DatabaseTableName, row: DatabaseSnapshot[DatabaseTableName][number]) {
  if (table === 'keyword_matches' && 'id' in row) {
    return String(row.id)
  }
  if (table === 'recipients' && 'name' in row) {
    return row.name
  }
  if (table === 'favorites' && 'name' in row) {
    return row.name
  }
  if (table === 'job_runs' && 'job_name' in row) {
    return row.job_name
  }
  if (table === 'settings' && 'key' in row) {
    return row.key
  }
  return JSON.stringify(row)
}

export default App
