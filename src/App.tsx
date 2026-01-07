/**
 * Outlook宛先作成アプリのメインコンポーネント
 * 2ペイン構成で宛先(To)とCCを独立して管理する
 */
import { useState, useCallback } from 'react'
import { useRecipients } from './hooks/useRecipients'
import { RecipientPane } from './components/RecipientPane'
import { Toast } from './components/Toast'

function App() {
  const { recipients, loading, error } = useRecipients()
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    setToastVisible(true)
  }, [])

  const hideToast = useCallback(() => {
    setToastVisible(false)
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
          />
        </div>

        {/* CCペイン */}
        <div className="flex-1 min-w-0">
          <RecipientPane
            title="CC"
            buttonLabel="CC作成"
            recipients={recipients}
            onCopySuccess={() => showToast('CCをコピーしました')}
          />
        </div>
      </div>

      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} />
    </div>
  )
}

export default App
