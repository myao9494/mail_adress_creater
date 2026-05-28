/**
 * HTML/リッチテキストの編集・貼り付けをサポートするエディタ
 * 
 * contentEditableなdivを用いて、ブラウザ標準のリッチテキスト貼り付け挙動を活かしつつ、
 * 日本語入力(IME)中のカーソル飛びを防ぐために非制御的に状態を同期します。
 **/
import { useRef, useEffect, ClipboardEvent } from 'react'
import { sanitizeHtml } from '../utils/htmlSanitizer'

interface HtmlEditorProps {
  value: string
  onChange: (val: string) => void
  className?: string
}

export function HtmlEditor({ value, onChange, className }: HtmlEditorProps) {
  const ref = useRef<HTMLDivElement>(null)

  // 外部からの更新（予定解析など）があった場合のみ innerHTML を同期する
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value
    }
  }, [value])

  const handleBlur = () => {
    if (ref.current) {
      onChange(ref.current.innerHTML)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const htmlData = e.clipboardData.getData('text/html')
    if (htmlData) {
      e.preventDefault()
      // Outlookの複雑なWord HTMLを標準的できれいなHTMLにサニタイズ
      const cleanHtml = sanitizeHtml(htmlData)
      
      // カーソル位置にサニタイズ後のHTMLを挿入
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        range.deleteContents()
        
        // 一時的なドキュメント断片を作成してHTMLノード群を挿入
        const el = document.createElement('div')
        el.innerHTML = cleanHtml
        const frag = document.createDocumentFragment()
        let node: ChildNode | null
        let lastNode: ChildNode | null = null
        while ((node = el.firstChild)) {
          lastNode = frag.appendChild(node)
        }
        range.insertNode(frag)
        
        // カーソル位置を挿入されたコンテンツの直後に移動
        if (lastNode) {
          const nextRange = range.cloneRange()
          nextRange.setStartAfter(lastNode)
          nextRange.collapse(true)
          selection.removeAllRanges()
          selection.addRange(nextRange)
        }
        
        // 即座に変更を反映
        if (ref.current) {
          onChange(ref.current.innerHTML)
        }
      }
    }
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onPaste={handlePaste}
      className={`${className} focus:outline-none`}
      style={{ outline: 'none' }}
    />
  )
}
