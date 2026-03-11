import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { UserMemory } from '../memory/user-memory.js'
import { ReasoningStream } from '../reasoning.js'
import { TelegramMemberSync } from '../members/telegram-sync.js'

describe('TelegramMemberSync', () => {
  let db: ReturnType<typeof createDb>
  let sync: TelegramMemberSync
  let bridge: any

  beforeEach(() => {
    db = createDb(':memory:')
    bridge = {
      getCurrentGroupChatId: vi.fn().mockReturnValue('-100123'),
      getChatAdministrators: vi.fn().mockResolvedValue([
        { id: 1, firstName: 'Admin', username: 'admin', isBot: false, status: 'administrator' },
      ]),
      getChatMemberCount: vi.fn().mockResolvedValue(3),
      getChatMember: vi.fn().mockResolvedValue({
        status: 'left',
        user: { id: 1, first_name: 'Admin', username: 'admin', is_bot: false },
      }),
    }

    sync = new TelegramMemberSync(
      db,
      new UserMemory(db),
      new ReasoningStream(),
      bridge,
      '-100123',
    )
  })

  it('seeds Telegram admins when the bot is added to a group', async () => {
    await sync.handleBotAdded({ id: '-100123', type: 'supergroup', title: 'Comunia' })

    const user = db.select().from(users).where(eq(users.telegramId, 'tg_1')).get()
    expect(user).toBeDefined()
    expect(user!.name).toBe('Admin')
    expect(bridge.getChatAdministrators).toHaveBeenCalledWith('-100123')
  })

  it('registers new members from Telegram join events', async () => {
    await sync.handleMembersAdded(
      { id: '-100123', type: 'supergroup', title: 'Comunia' },
      [{ id: 2, firstName: 'Ana', lastName: 'Lopez', isBot: false, status: 'member' }],
      'join_event',
    )

    const user = db.select().from(users).where(eq(users.telegramId, 'tg_2')).get()
    expect(user).toBeDefined()
    expect(user!.name).toBe('Ana Lopez')
    expect(user!.status).toBe('active')
  })

  it('marks known members inactive during cron reconciliation', async () => {
    db.insert(users).values({
      id: 'u1',
      telegramId: 'tg_1',
      name: 'Admin',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }).run()

    await sync.syncKnownMembers()

    const user = db.select().from(users).where(eq(users.telegramId, 'tg_1')).get()
    expect(user!.status).toBe('inactive')
    expect(bridge.getChatMember).toHaveBeenCalledWith('-100123', 1)
  })
})
