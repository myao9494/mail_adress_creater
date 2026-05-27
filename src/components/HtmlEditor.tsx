/**
 * HTML/リッチテキストの編集・貼り付けをサポートするエディタ
 * 
 * contentEditableなdivを用いて、ブラウザ標準のリッチテキスト貼り付け挙動を活かしつつ、
 * 日本語入力(IME)中のカーソル飛びを防ぐために非制御的に状態を同期します。
 **/
import React, { useRef, useEffect } from 'react'

interface HtmlEditorProps {
  value: string
  onChange: (val: string) => void
  className?: string
  placeholder?: string
}

export function HtmlEditor({ value, onChange, className, placeholder }: HtmlEditorProps) {
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

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      className={`${className} focus:outline-none`}
      style={{ outline: 'none' }}
      placeholder={placeholder}
    />
  )
}
