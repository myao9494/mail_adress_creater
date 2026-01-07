/**
 * 検索機能とチェック状態を管理するカスタムフック
 */
import { useState, useMemo, useCallback } from 'react'
import type { Recipient, CheckableRecipient } from '../types'
import { searchRecipients } from '../utils/search'

type UseSearchReturn = {
  query: string
  setQuery: (query: string) => void
  results: CheckableRecipient[]
  unmatchedKeywords: string[]
  toggleCheck: (name: string) => void
  getCheckedNames: () => string[]
  executeSearch: () => void
}

/**
 * 検索機能とチェック状態を管理する
 * @param recipients 検索対象のRecipient配列
 * @returns 検索クエリ、結果、チェック操作など
 */
export function useSearch(recipients: Recipient[]): UseSearchReturn {
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set())

  // 検索実行（Enterキーで呼ばれる）
  const executeSearch = useCallback(() => {
    setSearchedQuery(query)
    // 検索実行時、結果を全てチェックONにする
    const searchResults = searchRecipients(recipients, query)
    setCheckedNames(new Set(searchResults.map(r => r.name)))
  }, [query, recipients])

  // 検索結果（検索実行後のクエリで絞り込み）
  const results: CheckableRecipient[] = useMemo(() => {
    const filtered = searchRecipients(recipients, searchedQuery)
    return filtered.map(r => ({
      ...r,
      checked: checkedNames.has(r.name),
    }))
  }, [recipients, searchedQuery, checkedNames])

  // マッチしなかったキーワードを計算
  const unmatchedKeywords: string[] = useMemo(() => {
    const trimmedQuery = searchedQuery.trim()
    if (!trimmedQuery) return []

    const keywords = trimmedQuery.split(' ').filter(k => k.length > 0)
    return keywords.filter(keyword => {
      const keywordLower = keyword.toLowerCase()
      return !recipients.some(r => r.name.toLowerCase().includes(keywordLower))
    })
  }, [searchedQuery, recipients])

  // チェック状態の切り替え
  const toggleCheck = useCallback((name: string) => {
    setCheckedNames(prev => {
      const newSet = new Set(prev)
      if (newSet.has(name)) {
        newSet.delete(name)
      } else {
        newSet.add(name)
      }
      return newSet
    })
  }, [])

  // チェックされた名前を取得
  const getCheckedNames = useCallback(() => {
    return results.filter(r => r.checked).map(r => r.name)
  }, [results])

  return {
    query,
    setQuery,
    results,
    unmatchedKeywords,
    toggleCheck,
    getCheckedNames,
    executeSearch,
  }
}
