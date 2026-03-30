import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MessageRouter } from '../router/index.js'
import { createDb } from '../db/index.js'
import { communitySettings, users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { InboundMessage } from '../bridges/types.js'

describe('MessageRouter', () => {
  let db: ReturnType<typeof createDb>
  let router: MessageRouter
  const handleMessage = vi.fn().mockResolvedValue('response')
  const handleAdmin = vi.fn().mockResolvedValue('admin response')

  beforeEach(() => {
    db = createDb(':memory:')
    router = new MessageRouter(db, ['admin1'], handleMessage, handleAdmin)
    handleMessage.mockClear()
    handleAdmin.mockClear()
  })

  it('auto-registers new users', async () => {
    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'dm', chatId: 'chat1',
      userId: 'tg_123', userName: 'Emi', text: 'Hola!',
      timestamp: new Date().toISOString(),
    }
    await router.route(msg)

    const user = db.select().from(users).where(eq(users.telegramId, 'tg_123')).get()
    expect(user).toBeDefined()
    expect(user!.name).toBe('Emi')
  })

  it('does not duplicate existing users', async () => {
    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'dm', chatId: 'chat1',
      userId: 'tg_123', userName: 'Emi', text: 'Hola!',
      timestamp: new Date().toISOString(),
    }
    await router.route(msg)
    await router.route(msg)

    const all = db.select().from(users).where(eq(users.telegramId, 'tg_123')).all()
    expect(all).toHaveLength(1)
  })

  it('routes admin commands to admin handler', async () => {
    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'dm', chatId: 'chat1',
      userId: 'admin1', userName: 'Admin', text: '/stats',
      timestamp: new Date().toISOString(),
    }
    await router.route(msg)
    expect(handleAdmin).toHaveBeenCalledWith('/stats', expect.anything())
    expect(handleMessage).not.toHaveBeenCalled()
  })

  it('does not route normal non-admin group messages to the agent by default', async () => {
    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'group', chatId: 'group1',
      userId: 'tg_456', userName: 'Ana', text: 'When is the next asado?',
      timestamp: new Date().toISOString(),
    }
    const response = await router.route(msg)
    expect(response).toBe('')
    expect(handleMessage).not.toHaveBeenCalled()
  })

  it('allows explicit admin invocations in groups', async () => {
    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'group', chatId: 'group1',
      userId: 'admin1', userName: 'Admin', text: 'Comunia, help me draft the next event',
      timestamp: new Date().toISOString(),
    }
    await router.route(msg)
    expect(handleMessage).toHaveBeenCalledWith(msg, undefined)
  })

  it('allows open group mode when the owner changes the setting', async () => {
    db.insert(communitySettings).values({
      key: 'group_response_mode',
      value: 'open',
      updatedAt: new Date().toISOString(),
    }).run()

    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'group', chatId: 'group1',
      userId: 'tg_456', userName: 'Ana', text: 'When is the next asado?',
      timestamp: new Date().toISOString(),
    }

    await router.route(msg)
    expect(handleMessage).toHaveBeenCalledWith(msg, undefined)
  })

  it('blocks all inbound group replies in announcements-only mode', async () => {
    db.insert(communitySettings).values({
      key: 'group_response_mode',
      value: 'announcements_only',
      updatedAt: new Date().toISOString(),
    }).run()

    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'group', chatId: 'group1',
      userId: 'admin1', userName: 'Admin', text: 'Comunia, answer this in the group',
      timestamp: new Date().toISOString(),
    }

    const response = await router.route(msg)
    expect(response).toBe('')
    expect(handleMessage).not.toHaveBeenCalled()
  })

  it('updates lastActiveAt on every message', async () => {
    const msg: InboundMessage = {
      platform: 'telegram', chatType: 'dm', chatId: 'chat1',
      userId: 'tg_123', userName: 'Emi', text: 'Hey',
      timestamp: new Date().toISOString(),
    }
    await router.route(msg)
    const user = db.select().from(users).where(eq(users.telegramId, 'tg_123')).get()
    expect(user!.lastActiveAt).toBeDefined()
  })

  it('handles WhatsApp user registration', async () => {
    const msg: InboundMessage = {
      platform: 'whatsapp', chatType: 'dm', chatId: 'chat1',
      userId: 'wa_5491155551234', userName: 'Carlos', text: 'Hola!',
      timestamp: new Date().toISOString(),
    }
    await router.route(msg)
    const user = db.select().from(users).where(eq(users.whatsappId, 'wa_5491155551234')).get()
    expect(user).toBeDefined()
    expect(user!.name).toBe('Carlos')
  })
})
