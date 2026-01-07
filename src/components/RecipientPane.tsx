/**
 * 送信先選択ペインコンポーネント
 * 検索ボックス、チェックボックス付きリスト、作成ボタンを含む
 */
import { useState, useCallback, type KeyboardEvent } from 'react'
import type { Recipient } from '../types'
import { useSearch } from '../hooks/useSearch'
import { copyToClipboard } from '../utils/clipboard'

type RecipientPaneProps = {
  title: string
  buttonLabel: string
  recipients: Recipient[]
  onCopySuccess: () => void
}

/**
 * 宛先（To）またはCC用のペイン
 */
export function RecipientPane({
  title,
  buttonLabel,
  recipients,
  onCopySuccess,
}: RecipientPaneProps) {
  const { query, setQuery, results, unmatchedKeywords, toggleCheck, getCheckedNames, executeSearch } = useSearch(recipients)
  const [isInitial, setIsInitial] = useState(true)
  const [fontSize, setFontSize] = useState(11)

  // Enterで検索実行
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        executeSearch()
        setIsInitial(false)
      }
    },
    [executeSearch]
  )

  // コピーボタン押下
  const handleCopy = useCallback(async () => {
    const names = getCheckedNames()
    const success = await copyToClipboard(names)
    if (success) {
      onCopySuccess()
    }
  }, [getCheckedNames, onCopySuccess])

  // 検索実行済みで結果がない場合
  const noResults = !isInitial && results.length === 0

  return (
    <div className="flex flex-col h-full bg-gray-800/50 backdrop-blur-sm rounded-lg p-2 shadow-xl border border-gray-700/50">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">{title}</h2>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={fontSize}
            onChange={e => setFontSize(Math.max(8, Math.min(20, Number(e.target.value) || 11)))}
            min={8}
            max={20}
            className="w-10 px-1 py-0.5 text-[12px] text-center bg-gray-900/70 border border-gray-600/50 rounded text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <label className="text-[10px] text-gray-400">px</label>
        </div>
      </div>

      {/* 検索ボックス（複数行対応・動的高さ） */}
      <div className="relative mb-1">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="検索キーワードを入力（Enterで実行）"
          rows={3}
          style={{ fontSize: `${fontSize}px` }}
          className="w-full px-2 py-1.5 bg-gray-900/70 border border-gray-600/50 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-transparent transition-all resize-y min-h-[60px] max-h-[180px] leading-normal"
        />
        <div className="absolute right-1.5 bottom-1.5 text-gray-500 text-[9px] bg-gray-900/80 px-0.5 rounded">
          Enter↵
        </div>
      </div>

      {/* 作成ボタン */}
      <button
        onClick={handleCopy}
        disabled={isInitial || getCheckedNames().length === 0}
        className="w-full py-1 mb-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[11px] rounded font-medium hover:from-blue-500 hover:to-blue-400 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-500/20 disabled:shadow-none"
      >
        {buttonLabel}
      </button>

      {/* マッチしなかったキーワード表示 */}
      {!isInitial && unmatchedKeywords.length > 0 && (
        <div className="py-1 px-1.5 mb-1 text-[10px] text-amber-400/90 bg-amber-500/10 rounded border border-amber-500/20 leading-tight">
          <span className="text-amber-500/70">未検出: </span>
          {unmatchedKeywords.map((keyword, index) => (
            <span key={keyword}>
              <span className="font-medium">{keyword}</span>
              {index < unmatchedKeywords.length - 1 && ', '}
            </span>
          ))}
        </div>
      )}

      {/* 該当なしメッセージ */}
      {noResults && (
        <div className="py-1 text-amber-400/80 text-center text-[10px]">
          該当する名前が見つかりませんでした
        </div>
      )}

      {/* 検索結果リスト */}
      <div className="flex-1 overflow-y-auto rounded bg-gray-900/50 border border-gray-700/30">
        {isInitial ? (
          <div className="p-2 text-gray-500 text-center text-[10px]">
            検索キーワードを入力してEnter
          </div>
        ) : results.length === 0 ? null : (
          <ul className="divide-y divide-gray-700/30">
            {results.map(recipient => (
              <li
                key={recipient.name}
                className="flex items-center px-2 py-0.5 hover:bg-gray-700/30 cursor-pointer transition-colors"
                style={{ fontSize: `${fontSize}px` }}
                onClick={() => toggleCheck(recipient.name)}
              >
                <input
                  type="checkbox"
                  checked={recipient.checked}
                  onChange={() => {}} // liのonClickで処理
                  onClick={e => e.stopPropagation()}
                  className="w-3 h-3 mr-1.5 accent-blue-500 pointer-events-none rounded"
                />
                <span className="flex-1 text-gray-200 truncate">{recipient.name}</span>
                <span className="text-gray-500 ml-1.5 tabular-nums" style={{ fontSize: `${fontSize - 1}px` }}>{recipient.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
