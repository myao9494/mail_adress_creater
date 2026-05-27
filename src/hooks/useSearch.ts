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
  uncheckItem: (name: string) => void
  getCheckedNames: () => string[]
  executeSearch: () => void
  setQueryAndChecked: (query: string, checkedNames: string[], favoriteName?: string) => void
  appliedFavoriteName: string | null
  setAppliedFavoriteName: (name: string | null) => void
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
  const [appliedFavoriteName, setAppliedFavoriteName] = useState<string | null>(null)

  // 検索実行（Enterキーで呼ばれる）
  const executeSearch = useCallback(() => {
    setSearchedQuery(query)
    // 検索実行時、既存のチェックされたメンバー（お気に入りなど）は維持したまま、
    // 検索で新しくヒットしたメンバーもチェックONとして追加（マージ）する
    const searchResults = searchRecipients(recipients, query)
    setCheckedNames(prev => {
      const newSet = new Set(prev)
      searchResults.forEach(r => newSet.add(r.name))
      return newSet
    })
  }, [query, recipients])

  // 検索結果（検索実行後のクエリで絞り込み）
  const results: CheckableRecipient[] = useMemo(() => {
    const trimmedQuery = searchedQuery.trim()

    if (appliedFavoriteName && trimmedQuery === '') {
      // 1. お気に入りが適用されており、かつ検索が走っていない（クエリが空）とき：
      // リストには、現在チェックされているメンバー（お気に入りメンバー）のみをスッキリと表示する！
      const resultsList: CheckableRecipient[] = []
      
      // CSV内のメンバー
      recipients.forEach(r => {
        if (checkedNames.has(r.name)) {
          resultsList.push({
            ...r,
            checked: true,
          })
        }
      })

      // CSV外のメンバー
      const manualChecked = Array.from(checkedNames).filter(
        name => !recipients.some(r => r.name === name)
      )
      manualChecked.forEach(name => {
        resultsList.push({
          name,
          count: 0,
          checked: true,
        })
      })

      return resultsList
    } else {
      // 2. お気に入りが適用されていない、またはユーザーが検索を実行したとき：
      // 通常通り検索された結果を表示し、チェック状態をマージする。
      const filtered = searchRecipients(recipients, searchedQuery)
      const resultsList = filtered.map(r => ({
        ...r,
        checked: checkedNames.has(r.name),
      }))

      // もしお気に入り適用中にさらに追加検索している場合、
      // お気に入りのチェック済みメンバーも画面上に一緒に表示しておくと親切です。
      // ですので、お気に入り適用中の場合は、検索結果（resultsList）に加えて、
      // 現在チェックされているお気に入りメンバーのうち、まだresultsListに存在しないものも「チェック状態」でマージして表示します！
      if (appliedFavoriteName) {
        // 現在チェックされているすべてのメンバー
        const checkedList: CheckableRecipient[] = []
        recipients.forEach(r => {
          if (checkedNames.has(r.name) && !resultsList.some(existing => existing.name === r.name)) {
            checkedList.push({
              ...r,
              checked: true,
            })
          }
        })
        const manualChecked = Array.from(checkedNames).filter(
          name => !recipients.some(r => r.name === name) && !resultsList.some(existing => existing.name === name)
        )
        manualChecked.forEach(name => {
          checkedList.push({
            name,
            count: 0,
            checked: true,
          })
        })

        return [...resultsList, ...checkedList]
      }

      return resultsList
    }
  }, [recipients, searchedQuery, checkedNames, appliedFavoriteName])

  // マッチしなかったキーワードを計算
  const unmatchedKeywords: string[] = useMemo(() => {
    const trimmedQuery = searchedQuery.trim()
    if (!trimmedQuery) return []

    // 半角スペースと全角スペースの両方で区切る
    const keywords = trimmedQuery.split(/[\s\u3000]+/).filter(k => k.length > 0)
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

  // チェックを外す（選択解除）
  const uncheckItem = useCallback((name: string) => {
    setCheckedNames(prev => {
      const newSet = new Set(prev)
      newSet.delete(name)
      return newSet
    })
  }, [])

  // チェックされた名前を取得
  const getCheckedNames = useCallback(() => {
    return results.filter(r => r.checked).map(r => r.name)
  }, [results])

  // クエリとチェック状態を同時にセットする
  const setQueryAndChecked = useCallback((newQuery: string, namesToCheck: string[], favoriteName?: string) => {
    setQuery(newQuery)
    setSearchedQuery(newQuery)
    setCheckedNames(new Set(namesToCheck))
    if (favoriteName !== undefined) {
      setAppliedFavoriteName(favoriteName)
    }
  }, [])

  return {
    query,
    setQuery,
    results,
    unmatchedKeywords,
    toggleCheck,
    uncheckItem,
    getCheckedNames,
    executeSearch,
    setQueryAndChecked,
    appliedFavoriteName,
    setAppliedFavoriteName,
  }
}
