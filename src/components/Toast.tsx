/**
 * トースト通知コンポーネント
 * コピー成功時に軽いフィードバックを表示する
 */
import { useEffect } from 'react'

type ToastProps = {
  message: string
  visible: boolean
  onHide: () => void
}

/**
 * 一定時間後に自動で消えるトースト通知
 */
export function Toast({ message, visible, onHide }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onHide()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [visible, onHide])

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm px-4 py-2 rounded-lg shadow-xl shadow-emerald-500/20 z-50 animate-fade-in backdrop-blur-sm border border-emerald-400/20">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        {message}
      </div>
    </div>
  )
}
