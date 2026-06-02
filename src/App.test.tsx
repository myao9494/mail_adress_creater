/**
 * Appコンポーネントのテスト
 * 職アドチェック通知の確認機能などをテストする
 **/
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { loadUnconfirmedMatches, confirmMatches, parseSchedule, addSchedule, loadFavorites, saveFavorites, addFavorite } from './utils/api'

// apiモジュールの関数をモックする
vi.mock('./utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/api')>()
  return {
    ...actual,
    loadUnconfirmedMatches: vi.fn(),
    confirmMatches: vi.fn(),
    parseSchedule: vi.fn(),
    addSchedule: vi.fn(),
    loadSettings: vi.fn().mockResolvedValue({ keywords: ['棚卸'], address_interval_minutes: 60, keyword_interval_minutes: 60 }),
    saveSettings: vi.fn(),
    loadFavorites: vi.fn().mockResolvedValue({ favorites: [] }),
    saveFavorites: vi.fn(),
    addFavorite: vi.fn(),
    loadDatabase: vi.fn().mockResolvedValue({}),
  }
})

// hooksのモック
vi.mock('./hooks/useRecipients', () => ({
  useRecipients: () => ({
    recipients: [
      { name: '山田 太郎', count: 100 },
      { name: '佐藤 一郎', count: 50 },
      { name: '鈴木 三郎', count: 10 }
    ],
    loading: false,
    error: null,
    reload: vi.fn().mockResolvedValue(undefined),
  })
}))

describe('App - 職アド通知確認', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('未確認の職アド通知がある場合、確認ボタンを押すことで確認完了となり通知が消える', async () => {
    const mockMatches = [
      {
        id: 42,
        received_time: '2026-05-18T10:00:00',
        subject: '職アドからのお知らせ',
        line: 'テスト',
        keyword: '棚卸',
        is_new: false,
        confirmed: false,
      },
    ]

    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: mockMatches })
    vi.mocked(confirmMatches).mockResolvedValue({ updated: 1 })

    render(<App />)

    // 起動時のローディング終了・メッセージの表示を待つ
    await waitFor(() => {
      expect(screen.getByText('新しい職アド通知があります')).toBeInTheDocument()
    })

    expect(screen.getByText(/棚卸/)).toBeInTheDocument()
    expect(screen.getByText(/テスト/)).toBeInTheDocument()

    // 「確認」ボタン（OKボタン）が存在することを確認
    const confirmButton = screen.getByRole('button', { name: '確認' })
    expect(confirmButton).toBeInTheDocument()

    // ボタンをクリック
    fireEvent.click(confirmButton)

    // confirmMatches APIが正しいIDで呼び出されたことを確認
    await waitFor(() => {
      expect(confirmMatches).toHaveBeenCalledWith([42])
    })

    // バナーが消えたことを確認
    await waitFor(() => {
      expect(screen.queryByText('新しい職アド通知があります')).not.toBeInTheDocument()
    })
  })

  it('予定本文のHTML貼り付けをサポートし、Outlook追加時に正しくAPIへ渡されること', async () => {
    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: [] })

    const mockEvent = {
      start: '2026-05-20T15:00+09:00',
      end: '2026-05-20T16:30+09:00',
      subject: 'テスト会議',
      location: '会議室A',
      body: '',
      all_day: false,
      duration_minutes: 90,
      normalized_text: '今週の水曜日 15:00から16:30 テスト会議 @ 会議室A',
    }

    vi.mocked(parseSchedule).mockResolvedValue({ event: mockEvent })
    vi.mocked(addSchedule).mockResolvedValue({ event: { ...mockEvent, body: '<p>議題：進捗確認 <a href="http://example.com">資料リンク</a></p>' }, saved: true })

    render(<App />)

    // 予定解析用の入力欄に入力してEnterまたは解析ボタンクリック
    const input = screen.getByPlaceholderText('例: 今週の水曜日 15:00から16:30 調整会議')
    fireEvent.change(input, { target: { value: '今週の水曜日 15:00から16:30 テスト会議 @ 会議室A' } })

    const parseButton = screen.getByRole('button', { name: '予定解析' })
    fireEvent.click(parseButton)

    // 予定解析APIの呼び出しを確認
    await waitFor(() => {
      expect(parseSchedule).toHaveBeenCalledWith('今週の水曜日 15:00から16:30 テスト会議 @ 会議室A')
    })

    // 解析後、編集エリアが表示され、「本文」の編集欄が存在することを確認
    await waitFor(() => {
      expect(screen.getByText('件名')).toBeInTheDocument()
    })

    // ラベル「本文」に関連付けられた要素を取得する
    const bodyLabel = screen.getByText('本文')
    const editableDiv = bodyLabel.parentElement?.querySelector('[contenteditable="true"]')
    expect(editableDiv).toBeInTheDocument()

    // HTMLのペースト/編集をシミュレートする
    if (editableDiv) {
      editableDiv.innerHTML = '<p>議題：進捗確認 <a href="http://example.com">資料リンク</a></p>'
      fireEvent.blur(editableDiv)
    }

    // 「Outlook追加」ボタンをクリック
    const addButton = screen.getByRole('button', { name: 'Outlook追加' })
    fireEvent.click(addButton)

    // addSchedule APIがHTMLを含む正しいパラメータで呼び出されたことを確認
    await waitFor(() => {
      expect(addSchedule).toHaveBeenCalledWith(
        '今週の水曜日 15:00から16:30 テスト会議 @ 会議室A',
        expect.objectContaining({
          body: '<p>議題：進捗確認 <a href="http://example.com">資料リンク</a></p>',
          subject: 'テスト会議',
        })
      )
    })
  })

  it('お気に入りモーダルでお気に入りの宛先とCCを上下分割で個別に編集・保存できること', async () => {
    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: [] })
    const mockFavorites = [
      { name: '開発チーム', addresses: ['山田 太郎'], cc_addresses: ['鈴木 三郎'], updated_at: '2026-05-14T00:00:00+00:00' }
    ]
    vi.mocked(loadFavorites).mockResolvedValue({ favorites: mockFavorites })
    vi.mocked(saveFavorites).mockResolvedValue({ favorites: mockFavorites })

    render(<App />)

    // お気に入りボタンをクリックしてモーダルを開く
    const favoriteButton = await screen.findByRole('button', { name: 'お気に入り' })
    fireEvent.click(favoriteButton)

    // モーダルが表示され、上下分割テキストエリアが存在することを確認
    await waitFor(() => {
      expect(screen.getByText('宛先（To）のリスト（改行区切り）')).toBeInTheDocument()
      expect(screen.getByText('CC のリスト（改行区切り）')).toBeInTheDocument()
    })

    // テキストエリアに宛先とCCがそれぞれ正しくセットされていること
    const toTextarea = screen.getByPlaceholderText(/山田 太郎/)
    const ccTextarea = screen.getByPlaceholderText(/keiri@example.com/)
    expect(toTextarea).toHaveValue('山田 太郎')
    expect(ccTextarea).toHaveValue('鈴木 三郎')

    // 宛先とCCを書き換えて「保存」ボタンをクリック
    fireEvent.change(toTextarea, { target: { value: '佐藤 一郎' } })
    fireEvent.change(ccTextarea, { target: { value: '鈴木 二郎' } })

    const saveBtn = screen.getByRole('button', { name: '保存' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(saveFavorites).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          name: '開発チーム',
          addresses: ['佐藤 一郎'],
          cc_addresses: ['鈴木 二郎'],
        })
      ]))
    })
  })

  it('トップページの右クリックメニューから、現在の宛先・CCの選択内容をお気に入り登録でき、またお気に入りを呼び出してセットできること', async () => {
    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: [] })
    const mockFavorites = [
      { name: '開発チーム', addresses: ['山田 太郎'], cc_addresses: ['鈴木 三郎'], updated_at: '2026-05-14T00:00:00+00:00' },
      { name: '無関係グループ', addresses: ['佐藤 四郎'], cc_addresses: ['鈴木 五郎'], updated_at: '2026-05-14T00:00:00+00:00' }
    ]
    vi.mocked(loadFavorites).mockResolvedValue({ favorites: mockFavorites })
    
    // プロンプトをモック
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('新しいグループ')
    vi.mocked(addFavorite).mockResolvedValue({
      favorite: { name: '新しいグループ', addresses: ['山田 太郎'], cc_addresses: ['鈴木 三郎'] },
      favorites: [...mockFavorites, { name: '新しいグループ', addresses: ['山田 太郎'], cc_addresses: ['鈴木 三郎'] }]
    })

    const { container } = render(<App />)

    // ロード完了（お気に入りボタンの表示）を待つ
    await screen.findByRole('button', { name: 'お気に入り' })

    // Toペインで「開発チーム」を検索
    const toTextarea = screen.getAllByPlaceholderText('検索キーワードを入力（Enterで実行）')[0]
    fireEvent.change(toTextarea, { target: { value: '開発チーム' } })
    fireEvent.keyDown(toTextarea, { key: 'Enter' })

    // 検索結果に「★ 開発チーム」が表示されるのを待つ
    await screen.findByText('★ 開発チーム')

    // トップページの右クリック（ContextMenu）をシミュレート
    const mainContainer = container.firstChild as HTMLElement
    fireEvent.contextMenu(mainContainer)

    // カスタムコンテキストメニューが表示されることを確認
    const addFavOption = await screen.findByText('現在の宛先・CCをお気に入りに追加')
    expect(addFavOption).toBeInTheDocument()
    expect(screen.getByText('お気に入りを適用...')).toBeInTheDocument()

    // 現在の宛先・CCをお気に入りに追加をクリック
    fireEvent.click(addFavOption)

    // promptが呼ばれ、addFavorite APIが呼び出されることを確認
    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalled()
      expect(addFavorite).toHaveBeenCalledWith('新しいグループ', ['開発チーム'], [])
    })

    // 登録成功のトースト表示（＝状態更新の完了）を待つ
    await screen.findByText(/登録しました/)

    // 右クリックメニューからお気に入りを呼び出してセットするテスト
    fireEvent.contextMenu(mainContainer)

    const applyFavOption = await screen.findByText('お気に入りを適用...')
    expect(applyFavOption).toBeInTheDocument()

    const buttons = screen.getAllByRole('button')
    const targetFavOption = buttons.find(b => b.textContent?.includes('開発チーム') && b.textContent?.includes('To:'))
    expect(targetFavOption).toBeDefined()

    // 開発チームをクリックすると、宛先・CCペインにアドレスがセットされるはず
    fireEvent.click(targetFavOption!)
    
    // メニューが閉じること
    await waitFor(() => {
      expect(screen.queryByText('現在の宛先・CCをお気に入りに追加')).not.toBeInTheDocument()
    })

    // 適用後、検索キーワード（検索窓）が空であることを検証
    const toTextareaAfter = screen.getAllByPlaceholderText('検索キーワードを入力（Enterで実行）')[0] as HTMLTextAreaElement
    const ccTextareaAfter = screen.getAllByPlaceholderText('検索キーワードを入力（Enterで実行）')[1] as HTMLTextAreaElement
    expect(toTextareaAfter.value).toBe('')
    expect(ccTextareaAfter.value).toBe('')

    // 適用バッジが画面上に表示されていることを検証
    expect(screen.getAllByText('★ お気に入り「開発チーム」適用中').length).toBe(2)

    // 適用されたアドレスが画面上に存在することを検証
    // 「開発チーム」お気に入りは addresses: ['山田 太郎'], cc_addresses: ['鈴木 三郎']
    expect(await screen.findByText('山田 太郎')).toBeInTheDocument()
    expect(await screen.findByText('鈴木 三郎')).toBeInTheDocument()

    // チェックが入っていない無関係なアドレス（無関係グループのメンバー）が画面上に存在しないことを検証
    expect(screen.queryByText('佐藤 四郎')).not.toBeInTheDocument()
    expect(screen.queryByText('鈴木 五郎')).not.toBeInTheDocument()

    // 追加の検索を手動で実行する（例: 「佐藤」を検索して追加）
    const toTextareaSearch = screen.getAllByPlaceholderText('検索キーワードを入力（Enterで実行）')[0] as HTMLTextAreaElement
    fireEvent.change(toTextareaSearch, { target: { value: '佐藤' } })
    fireEvent.keyDown(toTextareaSearch, { key: 'Enter' })

    // 検索後もお気に入りバッジが表示され続けていることを検証
    expect(screen.getAllByText('★ お気に入り「開発チーム」適用中').length).toBe(2)

    // お気に入りメンバー「山田 太郎」が消えずに表示されたままであることを検証
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()

    // 新しく検索マッチした「佐藤 一郎」も画面に表示されていることを検証
    expect(screen.getByText('佐藤 一郎')).toBeInTheDocument()
  })

  it('メイン画面にプロフィールのコピーボタン（メール、電話、住所、部署）が表示され、クリックでクリップボードにコピーされトーストが表示されること', async () => {
    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: [] })
    const { loadSettings } = await import('./utils/api')
    vi.mocked(loadSettings).mockResolvedValue({
      keywords: ['棚卸'],
      address_interval_minutes: 60,
      keyword_interval_minutes: 60,
      my_email: 'user@example.com',
      my_phone: '090-0000-0000',
      my_address: '東京都千代田区',
      my_dept: '開発部',
    })

    // clipboardのモック
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    render(<App />)

    // コピーボタンがそれぞれ存在することを確認
    const emailBtn = await screen.findByRole('button', { name: 'メール' })
    const phoneBtn = screen.getByRole('button', { name: '電話' })
    const addressBtn = screen.getByRole('button', { name: '住所' })
    const deptBtn = screen.getByRole('button', { name: '部署' })

    expect(emailBtn).toBeInTheDocument()
    expect(phoneBtn).toBeInTheDocument()
    expect(addressBtn).toBeInTheDocument()
    expect(deptBtn).toBeInTheDocument()

    // メールアドレスボタンをクリック
    fireEvent.click(emailBtn)
    expect(writeTextMock).toHaveBeenLastCalledWith('user@example.com')
    await screen.findByText('メールアドレスをコピーしました')

    // 電話番号ボタンをクリック
    fireEvent.click(phoneBtn)
    expect(writeTextMock).toHaveBeenLastCalledWith('090-0000-0000')
    await screen.findByText('電話番号をコピーしました')

    // 住所ボタンをクリック
    fireEvent.click(addressBtn)
    expect(writeTextMock).toHaveBeenLastCalledWith('東京都千代田区')
    await screen.findByText('住所をコピーしました')

    // 部署ボタンをクリック
    fireEvent.click(deptBtn)
    expect(writeTextMock).toHaveBeenLastCalledWith('開発部')
    await screen.findByText('部署をコピーしました')
  })

  it('設定メニュー（ハンバーガー）を開いた際、プロフィールの入力欄が表示され、値を変更して保存すると保存APIが呼び出されること', async () => {
    vi.mocked(loadUnconfirmedMatches).mockResolvedValue({ matches: [] })
    const { loadSettings, saveSettings } = await import('./utils/api')
    vi.mocked(loadSettings).mockResolvedValue({
      keywords: ['棚卸'],
      address_interval_minutes: 60,
      keyword_interval_minutes: 60,
      my_email: 'old@example.com',
      my_phone: '090-1111-1111',
      my_address: '旧住所',
      my_dept: '旧部署',
    })
    vi.mocked(saveSettings).mockResolvedValue({
      keywords: ['棚卸'],
      address_interval_minutes: 60,
      keyword_interval_minutes: 60,
      my_email: 'new@example.com',
      my_phone: '090-2222-2222',
      my_address: '新住所',
      my_dept: '新部署',
    })

    render(<App />)

    // 設定メニュー（ハンバーガー）をクリックして開く
    const menuBtn = await screen.findByRole('button', { name: '設定メニュー' })
    fireEvent.click(menuBtn)

    // 入力欄が画面上に表示されるのを待つ
    const emailInput = screen.getByLabelText('メールアドレス')
    const phoneInput = screen.getByLabelText('電話番号')
    const addressInput = screen.getByLabelText('住所')
    const deptInput = screen.getByLabelText('部署')

    expect(emailInput).toHaveValue('old@example.com')
    expect(phoneInput).toHaveValue('090-1111-1111')
    expect(addressInput).toHaveValue('旧住所')
    expect(deptInput).toHaveValue('旧部署')

    // 値を編集
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
    fireEvent.change(phoneInput, { target: { value: '090-2222-2222' } })
    fireEvent.change(addressInput, { target: { value: '新住所' } })
    fireEvent.change(deptInput, { target: { value: '新部署' } })

    // 保存ボタンをクリック
    const saveBtn = screen.getByRole('button', { name: '設定保存' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
        my_email: 'new@example.com',
        my_phone: '090-2222-2222',
        my_address: '新住所',
        my_dept: '新部署',
      }))
    })
  })
})

