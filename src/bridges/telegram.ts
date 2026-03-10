import { Bot } from 'grammy'
import type { Bridge, InboundMessage, OutboundMessage } from './types.js'

interface TelegramConfig {
  botToken: string
  groupChatId: string
}

export class TelegramBridge implements Bridge {
  platform = 'telegram' as const
  private bot: Bot
  private config: TelegramConfig
  private handler?: (msg: InboundMessage) => Promise<void>

  constructor(config: TelegramConfig) {
    this.config = config
    this.bot = new Bot(config.botToken)
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
    this.bot.on('message:text', async (ctx) => {
      if (!ctx.from || ctx.from.is_bot) return
      if (!this.handler) return
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
    this.bot.start()
    console.log('✓ Telegram bridge started (long polling)')
  }

  async stop(): Promise<void> { this.bot.stop() }

  async sendMessage(msg: OutboundMessage): Promise<void> {
    await this.bot.api.sendMessage(msg.chatId, msg.text, {
      reply_to_message_id: msg.replyTo ? Number(msg.replyTo) : undefined,
    })
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler
  }
}
