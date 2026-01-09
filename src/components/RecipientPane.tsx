/**
 * 送信先選択ペインコンポーネント
 * 検索ボックス、チェックボックス付きリスト、作成ボタンを含む
 *
 * キーボードナビゲーション:
 * - 検索ボックス:
 *   - Enter: 検索実行（フォーカスは検索ボックスに残る）
 *   - Shift+Enter: 検索実行して結果の1番目にフォーカス移動
 *   - 下矢印: ボタンへ移動
 * - リスト:
 *   - 上下矢印: セクション間移動、リスト内アイテム移動
 *   - Enter: フォーカス中のアイテムをクリップボードにコピー
 *   - Ctrl+Enter / Shift+Enter: フォーカス中のアイテムのチェックをトグル（オン/オフ）
 *   - Space: チェックボックスのトグル
 *
 * クリック操作:
 * - チェックボックス以外の名前部分をクリック: その名前をクリップボードにコピー
 */
import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import type { Recipient } from '../types'
import { useSearch } from '../hooks/useSearch'
import { copyToClipboard } from '../utils/clipboard'

type RecipientPaneProps = {
  title: string
  buttonLabel: string
  recipients: Recipient[]
  onCopySuccess: () => void
  onNameCopy: (name: string) => void
  isFocused: boolean
  onFocus: () => void
}

// フォーカス可能なセクション
type FocusSection = 'search' | 'button' | 'list'

/**
 * 宛先（To）またはCC用のペイン
 */
export function RecipientPane({
  title,
  buttonLabel,
  recipients,
  onCopySuccess,
  onNameCopy,
  isFocused,
  onFocus,
}: RecipientPaneProps) {
  const { query, setQuery, results, unmatchedKeywords, toggleCheck, getCheckedNames, executeSearch } = useSearch(recipients)
  const [isInitial, setIsInitial] = useState(true)
  const [fontSize, setFontSize] = useState(11)
  const [focusedSection, setFocusedSection] = useState<FocusSection>('search')
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 検索結果の名前リスト（チェック状態変更では変わらない）
  const resultNames = results.map(r => r.name).join(',')

  // 検索結果の内容が変わったらフォーカスインデックスをリセット
  // （チェック状態の変更ではリセットしない）
  useEffect(() => {
    if (results.length > 0) {
      setFocusedIndex(0)
    } else {
      setFocusedIndex(-1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultNames])

  // ペインがフォーカスされたらセクションに応じてフォーカス
  useEffect(() => {
    if (isFocused) {
      switch (focusedSection) {
        case 'search':
          textareaRef.current?.focus({ preventScroll: true })
          break
        case 'button':
          buttonRef.current?.focus({ preventScroll: true })
          break
        case 'list':
          containerRef.current?.focus({ preventScroll: true })
          break
      }
    }
  }, [isFocused, focusedSection])

  // フォーカス中のアイテムをスクロールして表示
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const row = listRef.current.querySelector(`li[data-index="${focusedIndex}"]`)
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedIndex])

  // 名前をクリップボードにコピー
  const handleNameCopy = useCallback(async (name: string) => {
    const success = await copyToClipboard([name])
    if (success) {
      onNameCopy(name)
    }
  }, [onNameCopy])

  // テキストエリアのキーボードナビゲーション
  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Shift+Enter: 検索実行して結果にフォーカス移動
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        executeSearch()
        setIsInitial(false)
        // 検索実行後、結果があればリストの1番目にフォーカス移動
        setTimeout(() => {
          setFocusedSection('list')
          setFocusedIndex(0)
          containerRef.current?.focus()
        }, 0)
      }
      // Enter: 検索実行（フォーカスは検索ボックスに残す）
      else if (e.key === 'Enter') {
        e.preventDefault()
        executeSearch()
        setIsInitial(false)
      }
      // 下矢印: ボタンへ移動
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedSection('button')
        buttonRef.current?.focus()
      }
    },
    [executeSearch]
  )

  // ボタンのキーボードナビゲーション
  const handleButtonKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      // 上矢印: 検索ボックスへ移動
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedSection('search')
        textareaRef.current?.focus()
      }
      // 下矢印: リストへ移動（結果がある場合）
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (results.length > 0) {
          setFocusedSection('list')
          setFocusedIndex(0)
          containerRef.current?.focus()
        }
      }
    },
    [results.length]
  )

  // リスト部分のキーボードナビゲーション
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // テキストエリアやボタンにフォーカス中は無視
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) {
        return
      }

      // 上矢印: フォーカスを上に移動、先頭ならボタンへ
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (focusedIndex <= 0) {
          // 先頭で上を押したらボタンへ移動
          setFocusedSection('button')
          buttonRef.current?.focus()
        } else {
          setFocusedIndex(prev => prev - 1)
        }
      }
      // 下矢印: フォーカスを下に移動
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (results.length > 0) {
          setFocusedIndex(prev => Math.min(results.length - 1, prev + 1))
        }
      }
      // Ctrl+Enter または Shift+Enter: フォーカス中のアイテムのチェックをトグル
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < results.length) {
          toggleCheck(results[focusedIndex].name)
        }
      }
      // Enter: フォーカス中のアイテムをコピー
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < results.length) {
          handleNameCopy(results[focusedIndex].name)
        }
      }
      // Space: チェックボックスのトグル
      else if (e.key === ' ') {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < results.length) {
          toggleCheck(results[focusedIndex].name)
        }
      }
    },
    [results, focusedIndex, handleNameCopy, toggleCheck]
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
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onClick={onFocus}
      onFocus={(e) => {
        // コンテナ自体にフォーカスが来たらリストセクション
        if (e.target === containerRef.current) {
          setFocusedSection('list')
        }
      }}
      className={`flex flex-col h-full bg-gray-800/50 backdrop-blur-sm rounded-lg p-2 shadow-xl border transition-colors outline-none ${
        isFocused ? 'border-blue-500/70 ring-1 ring-blue-500/30' : 'border-gray-700/50'
      }`}
    >
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
          ref={textareaRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onFocus={() => setFocusedSection('search')}
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
        ref={buttonRef}
        onClick={handleCopy}
        onKeyDown={handleButtonKeyDown}
        onFocus={() => setFocusedSection('button')}
        disabled={isInitial || getCheckedNames().length === 0}
        className={`w-full py-1 mb-1 text-white text-[11px] rounded font-medium transition-all shadow-md disabled:shadow-none ${
          isFocused && focusedSection === 'button'
            ? 'bg-gradient-to-r from-blue-500 to-blue-400 ring-2 ring-blue-400/50'
            : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20'
        } disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed`}
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
          <ul ref={listRef} className="divide-y divide-gray-700/30">
            {results.map((recipient, index) => (
              <li
                key={recipient.name}
                data-index={index}
                className={`flex items-center px-2 py-0.5 cursor-pointer transition-colors ${
                  isFocused && focusedIndex === index
                    ? 'bg-blue-600/30 ring-1 ring-inset ring-blue-500/50'
                    : 'hover:bg-gray-700/30'
                }`}
                style={{ fontSize: `${fontSize}px` }}
              >
                <input
                  type="checkbox"
                  checked={recipient.checked}
                  onChange={() => toggleCheck(recipient.name)}
                  onClick={e => e.stopPropagation()}
                  className="w-3 h-3 mr-1.5 accent-blue-500 rounded cursor-pointer"
                />
                <span
                  className="flex-1 text-gray-200 truncate hover:text-blue-300 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleNameCopy(recipient.name)
                  }}
                  title="クリックでコピー"
                >
                  {recipient.name}
                </span>
                <span className="text-gray-500 ml-1.5 tabular-nums" style={{ fontSize: `${fontSize - 1}px` }}>{recipient.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
