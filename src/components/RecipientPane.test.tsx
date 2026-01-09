/**
 * RecipientPaneコンポーネントの結合テスト
 * 検索、チェック、コピー機能の動作確認
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecipientPane } from './RecipientPane'
import type { Recipient } from '../types'

const mockRecipients: Recipient[] = [
  { name: '山田 太郎', count: 120 },
  { name: '山田 花子', count: 85 },
  { name: '佐藤 一郎', count: 200 },
  { name: '鈴木 恒一', count: 150 },
]

// デフォルトのプロパティ
const defaultProps = {
  title: '宛先（To）',
  buttonLabel: '宛先作成',
  recipients: mockRecipients,
  onCopySuccess: () => {},
  onNameCopy: () => {},
  isFocused: false,
  onFocus: () => {},
}

describe('RecipientPane', () => {
  beforeEach(() => {
    // クリップボードAPIをモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('初期状態で検索案内が表示される', () => {
    render(<RecipientPane {...defaultProps} />)

    expect(screen.getByText('検索キーワードを入力してEnter')).toBeInTheDocument()
  })

  it('タイトルとボタンラベルが表示される', () => {
    render(<RecipientPane {...defaultProps} title="CC" buttonLabel="CC作成" />)

    expect(screen.getByText('CC')).toBeInTheDocument()
    expect(screen.getByText('CC作成')).toBeInTheDocument()
  })

  it('検索実行で結果が表示される', () => {
    render(<RecipientPane {...defaultProps} />)

    const input = screen.getByPlaceholderText('検索キーワードを入力（Enterで実行）')
    fireEvent.change(input, { target: { value: '山田' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
    expect(screen.getByText('山田 花子')).toBeInTheDocument()
    expect(screen.queryByText('佐藤 一郎')).not.toBeInTheDocument()
  })

  it('検索結果のチェックボックスは初期状態で全てON', () => {
    render(<RecipientPane {...defaultProps} />)

    const input = screen.getByPlaceholderText('検索キーワードを入力（Enterで実行）')
    fireEvent.change(input, { target: { value: '山田' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeChecked()
    })
  })

  it('チェックボックスクリックでチェックOFF', () => {
    render(<RecipientPane {...defaultProps} />)

    const input = screen.getByPlaceholderText('検索キーワードを入力（Enterで実行）')
    fireEvent.change(input, { target: { value: '山田' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // チェックボックスをクリック
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    expect(checkboxes[0]).not.toBeChecked()
    expect(checkboxes[1]).toBeChecked()
  })

  it('コピーボタンクリックでクリップボードにコピー', async () => {
    const onCopySuccess = vi.fn()

    render(<RecipientPane {...defaultProps} onCopySuccess={onCopySuccess} />)

    const input = screen.getByPlaceholderText('検索キーワードを入力（Enterで実行）')
    fireEvent.change(input, { target: { value: '山田' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const button = screen.getByText('宛先作成')
    await fireEvent.click(button)

    // 非同期処理を待つ
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(navigator.clipboard.writeText).toHaveBeenCalled()
    expect(onCopySuccess).toHaveBeenCalled()
  })

  it('該当なしの場合はメッセージ表示', () => {
    render(<RecipientPane {...defaultProps} />)

    const input = screen.getByPlaceholderText('検索キーワードを入力（Enterで実行）')
    fireEvent.change(input, { target: { value: '存在しない名前' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('該当する名前が見つかりませんでした')).toBeInTheDocument()
  })

  it('初期状態ではボタンが無効', () => {
    render(<RecipientPane {...defaultProps} />)

    const button = screen.getByText('宛先作成')
    expect(button).toBeDisabled()
  })

  it('名前クリックでクリップボードにコピー', async () => {
    const onNameCopy = vi.fn()

    render(<RecipientPane {...defaultProps} onNameCopy={onNameCopy} />)

    const input = screen.getByPlaceholderText('検索キーワードを入力（Enterで実行）')
    fireEvent.change(input, { target: { value: '山田' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // 名前をクリック
    const nameSpan = screen.getByText('山田 太郎')
    fireEvent.click(nameSpan)

    // 非同期処理を待つ
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('山田 太郎')
    expect(onNameCopy).toHaveBeenCalledWith('山田 太郎')
  })
})
