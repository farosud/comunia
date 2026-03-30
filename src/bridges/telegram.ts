import { Bot } from 'grammy'
import type { Bridge, InboundMessage, OutboundMessage } from './types.js'

interface TelegramConfig {
  botToken: string
  groupChatId: string
}

const TELEGRAM_ALLOWED_UPDATES = ['message', 'my_chat_member', 'chat_member'] as const

export type TelegramMembershipSource = 'group_seed' | 'join_event' | 'chat_member_update' | 'left_event' | 'cron_sync'

export interface TelegramChatInfo {
  id: string
  type: string
  title?: string
}

export interface TelegramMemberProfile {
  id: number
  firstName: string
  lastName?: string
  username?: string
  isBot: boolean
  status?: string
}

export interface TelegramForumTopic {
  messageThreadId: number
  name: string
}

export class TelegramBridge implements Bridge {
  platform = 'telegram' as const
  private bot: Bot
  private config: TelegramConfig
  private handler?: (msg: InboundMessage) => Promise<void>
  private listenerRegistered = false
  private started = false
  private currentGroupChatId?: string
  private groupConnectedHandler?: (chat: TelegramChatInfo) => Promise<void>
  private membersAddedHandler?: (
    chat: TelegramChatInfo,
    members: TelegramMemberProfile[],
    source: TelegramMembershipSource,
  ) => Promise<void>
  private memberStatusHandler?: (
    chat: TelegramChatInfo,
    member: TelegramMemberProfile,
    oldStatus: string | undefined,
    newStatus: string | undefined,
    source: TelegramMembershipSource,
  ) => Promise<void>

  constructor(config: TelegramConfig) {
    this.config = config
    this.bot = new Bot(config.botToken)
    this.currentGroupChatId = config.groupChatId || undefined
  }

  normalizeMessage(raw: {
    message_id: number
    chat: { id: number; type: string }
    from: { id: number; first_name: string; is_bot: boolean }
    text: string
    date: number
    reply_to_message?: { message_id: number }
  }): InboundMessage {
    const chatType = raw.chat.type === 'private' ? 'dm' : 'group'
    return {
      platform: 'telegram',
      chatType,
      chatId: String(raw.chat.id),
      userId: `tg_${raw.from.id}`,
      userName: raw.from.first_name,
      text: raw.text,
      replyTo: raw.reply_to_message ? String(raw.reply_to_message.message_id) : undefined,
      timestamp: new Date(raw.date * 1000).toISOString(),
    }
  }

  async start(): Promise<void> {
    if (!this.listenerRegistered) {
      this.bot.on('message:text', async (ctx) => {
        if (!ctx.from || ctx.from.is_bot) return
        if (!this.handler) return
        if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
          this.currentGroupChatId = String(ctx.chat.id)
        }
        const msg = this.normalizeMessage({
          message_id: ctx.message.message_id,
          chat: { id: ctx.chat.id, type: ctx.chat.type },
          from: { id: ctx.from.id, first_name: ctx.from.first_name, is_bot: ctx.from.is_bot },
          text: ctx.message.text,
          date: ctx.message.date,
          reply_to_message: ctx.message.reply_to_message
            ? { message_id: ctx.message.reply_to_message.message_id }
            : undefined,
        })
        await this.handler(msg)
      })

      this.bot.on('message:new_chat_members', async (ctx) => {
        const chat = this.normalizeChat(ctx.chat)
        if (!this.isGroupChat(chat.type) || !this.membersAddedHandler) return
        this.currentGroupChatId = chat.id
        await this.membersAddedHandler(
          chat,
          ctx.message.new_chat_members.map((member) => this.normalizeTelegramUser(member, 'member')),
          'join_event',
        )
      })

      this.bot.on('message:left_chat_member', async (ctx) => {
        const chat = this.normalizeChat(ctx.chat)
        if (!this.isGroupChat(chat.type) || !this.memberStatusHandler) return
        this.currentGroupChatId = chat.id
        await this.memberStatusHandler(
          chat,
          this.normalizeTelegramUser(ctx.message.left_chat_member, 'left'),
          'member',
          'left',
          'left_event',
        )
      })

      this.bot.on('my_chat_member', async (ctx) => {
        const update = ctx.update.my_chat_member
        if (!update) return
        const chat = this.normalizeChat(update.chat)
        if (!this.isGroupChat(chat.type)) return

        const oldStatus = update.old_chat_member.status
        const newStatus = update.new_chat_member.status
        if (this.isActiveMemberStatus(newStatus) && !this.isActiveMemberStatus(oldStatus)) {
          this.currentGroupChatId = chat.id
          await this.groupConnectedHandler?.(chat)
        }
      })

      this.bot.on('chat_member', async (ctx) => {
        const update = ctx.update.chat_member
        if (!update || !this.memberStatusHandler) return
        const chat = this.normalizeChat(update.chat)
        if (!this.isGroupChat(chat.type)) return

        this.currentGroupChatId = chat.id
        await this.memberStatusHandler(
          chat,
          this.normalizeTelegramUser(update.new_chat_member.user, update.new_chat_member.status),
          update.old_chat_member.status,
          update.new_chat_member.status,
          'chat_member_update',
        )
      })

      this.listenerRegistered = true
    }

    if (this.started) return

    this.started = true
    console.log('✓ Telegram bridge started (long polling)')
    try {
      await this.bot.start({ allowed_updates: TELEGRAM_ALLOWED_UPDATES })
    } finally {
      this.started = false
    }
  }

  async stop(): Promise<void> {
    this.bot.stop()
    this.started = false
  }

  async sendMessage(msg: OutboundMessage): Promise<void> {
    await this.sendMessageWithMetadata(msg)
  }

  async sendMessageWithMetadata(msg: OutboundMessage): Promise<{ messageId: number }> {
    const sent = await this.bot.api.sendMessage(msg.chatId, msg.text, {
      reply_to_message_id: msg.replyTo ? Number(msg.replyTo) : undefined,
    })
    return { messageId: sent.message_id }
  }

  async editMessageText(chatId: string, messageId: number, text: string): Promise<void> {
    await this.bot.api.editMessageText(chatId, messageId, text)
  }

  async sendChatAction(chatId: string, action: 'typing' | 'upload_photo' = 'typing'): Promise<void> {
    await this.bot.api.sendChatAction(chatId, action)
  }

  async deleteMessage(chatId: string, messageId: number): Promise<void> {
    await this.bot.api.deleteMessage(chatId, messageId)
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler
  }

  onGroupConnected(handler: (chat: TelegramChatInfo) => Promise<void>): void {
    this.groupConnectedHandler = handler
  }

  onMembersAdded(
    handler: (
      chat: TelegramChatInfo,
      members: TelegramMemberProfile[],
      source: TelegramMembershipSource,
    ) => Promise<void>,
  ): void {
    this.membersAddedHandler = handler
  }

  onMemberStatusChanged(
    handler: (
      chat: TelegramChatInfo,
      member: TelegramMemberProfile,
      oldStatus: string | undefined,
      newStatus: string | undefined,
      source: TelegramMembershipSource,
    ) => Promise<void>,
  ): void {
    this.memberStatusHandler = handler
  }

  getCurrentGroupChatId(): string | undefined {
    return this.currentGroupChatId
  }

  async getChatAdministrators(chatId = this.requireGroupChatId()): Promise<TelegramMemberProfile[]> {
    const admins = await this.bot.api.getChatAdministrators(chatId)
    return admins.map((admin) => this.normalizeTelegramUser(admin.user, admin.status))
  }

  async getChatMemberCount(chatId = this.requireGroupChatId()): Promise<number> {
    return this.bot.api.getChatMemberCount(chatId)
  }

  async getChatMember(chatId: string, userId: number): Promise<any> {
    return this.bot.api.getChatMember(chatId, userId)
  }

  async createForumTopic(name: string, chatId = this.requireGroupChatId()): Promise<TelegramForumTopic> {
    const topic = await this.bot.api.createForumTopic(chatId, name)
    return {
      messageThreadId: topic.message_thread_id,
      name: topic.name,
    }
  }

  private normalizeChat(chat: { id: number; type: string; title?: string }): TelegramChatInfo {
    return {
      id: String(chat.id),
      type: chat.type,
      title: chat.title,
    }
  }

  private normalizeTelegramUser(user: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
    is_bot?: boolean
  }, status?: string): TelegramMemberProfile {
    return {
      id: user.id,
      firstName: user.first_name || user.username || `Telegram ${user.id}`,
      lastName: user.last_name,
      username: user.username,
      isBot: Boolean(user.is_bot),
      status,
    }
  }

  private isGroupChat(type: string): boolean {
    return type === 'group' || type === 'supergroup'
  }

  private isActiveMemberStatus(status: string | undefined): boolean {
    return status === 'member' || status === 'administrator' || status === 'creator' || status === 'restricted'
  }

  private requireGroupChatId(): string {
    const chatId = this.currentGroupChatId || this.config.groupChatId
    if (!chatId) {
      throw new Error('Telegram group chat ID is not known yet')
    }
    return chatId
  }
}
