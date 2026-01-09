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

type FocusedPane = 'left' | 'right'

function App() {
  const { recipients, loading, error } = useRecipients()
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [focusedPane, setFocusedPane] = useState<FocusedPane>('left')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    setToastVisible(true)
  }, [])

  const hideToast = useCallback(() => {
    setToastVisible(false)
  }, [])

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
    <div className="h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 p-2">
      {/* 2ペイン */}
      <div className="flex gap-2 h-full">
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
