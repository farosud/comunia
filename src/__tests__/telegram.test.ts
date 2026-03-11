import { describe, it, expect, vi } from 'vitest'
import { TelegramBridge } from '../bridges/telegram.js'

const FAKE_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'

describe('TelegramBridge', () => {
  it('normalizes a telegram message to InboundMessage', () => {
    const bridge = new TelegramBridge({ botToken: FAKE_TOKEN, groupChatId: '-100123' })
    const normalized = bridge.normalizeMessage({
      message_id: 1,
      chat: { id: -100123, type: 'group' },
      from: { id: 456, first_name: 'Emi', is_bot: false },
      text: 'Hagamos un asado',
      date: 1710000000,
    })
    expect(normalized.platform).toBe('telegram')
    expect(normalized.chatType).toBe('group')
    expect(normalized.userId).toBe('tg_456')
    expect(normalized.userName).toBe('Emi')
    expect(normalized.text).toBe('Hagamos un asado')
  })

  it('detects DM vs group', () => {
    const bridge = new TelegramBridge({ botToken: FAKE_TOKEN, groupChatId: '-100123' })
    const dm = bridge.normalizeMessage({
      message_id: 2,
      chat: { id: 789, type: 'private' },
      from: { id: 789, first_name: 'User', is_bot: false },
      text: 'hola',
      date: 1710000000,
    })
    expect(dm.chatType).toBe('dm')
  })

  it('awaits polling lifecycle and only registers the listener once', async () => {
    const bridge = new TelegramBridge({ botToken: FAKE_TOKEN, groupChatId: '-100123' })
    const on = vi.fn()
    let resolveFirstStart!: () => void
    let resolveSecondStart!: () => void
    const start = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirstStart = resolve
      }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveSecondStart = resolve
      }))

    ;(bridge as any).bot = {
      on,
      start,
      stop: vi.fn(),
    }

    let firstSettled = false
    const firstRun = bridge.start().then(() => {
      firstSettled = true
    })

    await Promise.resolve()
    expect(on).toHaveBeenCalledTimes(5)
    expect(start).toHaveBeenCalledTimes(1)
    expect(firstSettled).toBe(false)

    resolveFirstStart()
    await firstRun

    const secondRun = bridge.start()
    await Promise.resolve()
    expect(on).toHaveBeenCalledTimes(5)
    expect(start).toHaveBeenCalledTimes(2)

    resolveSecondStart()
    await secondRun
  })
})
