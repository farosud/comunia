import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { ReasoningStream } from '../reasoning.js'
import type {
  TelegramBridge,
  TelegramChatInfo,
  TelegramMemberProfile,
  TelegramMembershipSource,
} from '../bridges/telegram.js'

type Db = any

const ACTIVE_STATUSES = new Set(['member', 'administrator', 'creator', 'restricted'])
const INACTIVE_STATUSES = new Set(['left', 'kicked'])

export class TelegramMemberSync {
  private activeGroupChatId?: string

  constructor(
    private db: Db,
    private userMemory: UserMemory,
    private reasoning: ReasoningStream,
    private bridge: TelegramBridge,
    initialGroupChatId?: string,
  ) {
    this.activeGroupChatId = initialGroupChatId || undefined
  }

  getActiveGroupChatId(): string | undefined {
    return this.activeGroupChatId || this.bridge.getCurrentGroupChatId()
  }

  async handleBotAdded(chat: TelegramChatInfo): Promise<void> {
    this.setActiveGroupChat(chat)
    this.reason('step', `Connected to Telegram group ${chat.title || chat.id}. Seeding the dashboard.`)

    const admins = await this.bridge.getChatAdministrators(chat.id)
    await this.handleMembersAdded(chat, admins, 'group_seed')

    const memberCount = await this.bridge.getChatMemberCount(chat.id)
    const remainder = Math.max(memberCount - admins.filter((m) => !m.isBot).length, 0)

    this.reason(
      'detail',
      remainder > 0
        ? `Seeded ${admins.length} administrators. Telegram exposes current admins immediately, but not a full historical member list via the Bot API, so the remaining ${remainder} members will appear as they interact or when Telegram sends membership updates.`
        : `Seeded ${admins.length} members from the current Telegram administrators list.`,
      { memberCount, adminsSeeded: admins.length },
    )
  }

  async handleMembersAdded(
    chat: TelegramChatInfo,
    members: TelegramMemberProfile[],
    source: TelegramMembershipSource,
  ): Promise<void> {
    this.setActiveGroupChat(chat)

    let synced = 0
    for (const member of members) {
      if (member.isBot) continue
      await this.upsertMember(chat, member, source, member.status || 'member')
      synced += 1
    }

    if (synced > 0) {
      this.reason('decision', `Synced ${synced} Telegram member${synced === 1 ? '' : 's'} from ${source}.`, {
        chatId: chat.id,
        source,
      })
    }
  }

  async handleMemberStatusChange(
    chat: TelegramChatInfo,
    member: TelegramMemberProfile,
    oldStatus: string | undefined,
    newStatus: string | undefined,
    source: TelegramMembershipSource,
  ): Promise<void> {
    this.setActiveGroupChat(chat)
    if (member.isBot) return

    if (newStatus && ACTIVE_STATUSES.has(newStatus)) {
      await this.upsertMember(chat, member, source, newStatus)
      if (!ACTIVE_STATUSES.has(oldStatus || '')) {
        this.reason('detail', `${this.displayName(member)} joined ${chat.title || chat.id}.`, { source })
      }
      return
    }

    if (newStatus && INACTIVE_STATUSES.has(newStatus)) {
      const existing = this.db.select().from(users)
        .where(eq(users.telegramId, this.platformTelegramId(member.id))).get()

      if (existing) {
        this.db.update(users)
          .set({ status: 'inactive' })
          .where(eq(users.id, existing.id)).run()
        await this.persistProfile(existing.id, member, chat, source, newStatus)
      }

      this.reason('detail', `${this.displayName(member)} left ${chat.title || chat.id}.`, { source })
    }
  }

  async syncKnownMembers(): Promise<void> {
    const chatId = this.getActiveGroupChatId()
    if (!chatId) {
      this.reason('detail', 'Skipping Telegram member sync because no group chat has been detected yet.')
      return
    }

    const admins = await this.bridge.getChatAdministrators(chatId)
    await this.handleMembersAdded({ id: chatId, type: 'supergroup' }, admins, 'cron_sync')

    const knownUsers = this.db.select().from(users).all()
      .filter((user: any) => typeof user.telegramId === 'string' && user.telegramId.startsWith('tg_'))

    let reconciled = 0
    for (const user of knownUsers) {
      const telegramNumericId = this.parseTelegramNumericId(user.telegramId)
      if (!telegramNumericId) continue

      try {
        const member = await this.bridge.getChatMember(chatId, telegramNumericId)
        await this.handleMemberStatusChange(
          { id: chatId, type: 'supergroup' },
          {
            id: member.user.id,
            firstName: member.user.first_name || member.user.username || user.name,
            lastName: member.user.last_name,
            username: member.user.username,
            isBot: Boolean(member.user.is_bot),
            status: member.status,
          },
          user.status === 'active' ? 'member' : 'left',
          member.status,
          'cron_sync',
        )
        reconciled += 1
      } catch (error) {
        this.reason('detail', `Failed to reconcile Telegram member ${user.name}: ${String(error)}`)
      }
    }

    const memberCount = await this.bridge.getChatMemberCount(chatId)
    this.reason(
      'decision',
      `Telegram member sync complete: reconciled ${reconciled} known member${reconciled === 1 ? '' : 's'} in a group of ${memberCount}.`,
      { chatId, reconciled, memberCount },
    )
  }

  private async upsertMember(
    chat: TelegramChatInfo,
    member: TelegramMemberProfile,
    source: TelegramMembershipSource,
    status: string,
  ): Promise<void> {
    const telegramId = this.platformTelegramId(member.id)
    const existing = this.db.select().from(users).where(eq(users.telegramId, telegramId)).get()
    const now = new Date().toISOString()
    const userStatus = INACTIVE_STATUSES.has(status) ? 'inactive' : 'active'
    const name = this.displayName(member)
    let userId: string

    if (existing) {
      userId = existing.id
      this.db.update(users)
        .set({
          name,
          status: userStatus,
          lastActiveAt: now,
        })
        .where(eq(users.id, existing.id)).run()
    } else {
      userId = randomUUID()
      this.db.insert(users).values({
        id: userId,
        telegramId,
        name,
        status: userStatus,
        joinedAt: now,
        lastActiveAt: now,
      }).run()
    }

    await this.persistProfile(userId, member, chat, source, status)
  }

  private async persistProfile(
    userId: string,
    member: TelegramMemberProfile,
    chat: TelegramChatInfo,
    source: TelegramMembershipSource,
    status: string,
  ): Promise<void> {
    await this.userMemory.set(userId, 'telegram', 'user_id', String(member.id), 1, source)
    await this.userMemory.set(userId, 'telegram', 'membership_status', status, 0.95, source)
    await this.userMemory.set(userId, 'telegram', 'group_chat_id', chat.id, 0.9, source)

    if (chat.title) {
      await this.userMemory.set(userId, 'telegram', 'group_title', chat.title, 0.9, source)
    }
    if (member.firstName) {
      await this.userMemory.set(userId, 'telegram', 'first_name', member.firstName, 1, source)
    }
    if (member.lastName) {
      await this.userMemory.set(userId, 'telegram', 'last_name', member.lastName, 1, source)
    }
    if (member.username) {
      await this.userMemory.set(userId, 'telegram', 'username', member.username, 1, source)
    }
  }

  private setActiveGroupChat(chat: TelegramChatInfo): void {
    if (chat.type === 'group' || chat.type === 'supergroup') {
      this.activeGroupChatId = chat.id
    }
  }

  private platformTelegramId(id: number | string): string {
    return `tg_${id}`
  }

  private parseTelegramNumericId(id: string): number | undefined {
    const raw = id.startsWith('tg_') ? id.slice(3) : id
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private displayName(member: TelegramMemberProfile): string {
    return [member.firstName, member.lastName].filter(Boolean).join(' ')
      || member.username
      || `Telegram ${member.id}`
  }

  private reason(level: 'step' | 'detail' | 'decision', message: string, data?: Record<string, unknown>): void {
    this.reasoning.emit_reasoning({ jobName: 'telegram-member-sync', level, message, data })
  }
}
