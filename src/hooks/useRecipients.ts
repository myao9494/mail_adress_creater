/**
 * CSVデータを読み込むカスタムフック
 */
import { useState, useEffect } from 'react'
import type { Recipient } from '../types'
import { loadRecipients } from '../utils/csvParser'

type UseRecipientsReturn = {
  recipients: Recipient[]
  loading: boolean
  error: string | null
}

/**
 * CSVファイルから送信先データを読み込む
 * @returns recipients: 送信先データ, loading: 読み込み中フラグ, error: エラーメッセージ
 */
export function useRecipients(): UseRecipientsReturn {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRecipients()
      .then(data => {
        setRecipients(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました')
        setLoading(false)
      })
  }, [])

  return { recipients, loading, error }
}
