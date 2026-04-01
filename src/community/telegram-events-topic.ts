import { eq } from 'drizzle-orm'
import { communitySettings } from '../db/schema.js'

type Db = any

export interface TelegramEventsTopicState {
  chatId?: string
  messageThreadId?: number
  name: string
  lastPostAt?: string
  lastPermissionRequestAt?: string
}

const KEYS = {
  chatId: 'telegram_events_topic_chat_id',
  messageThreadId: 'telegram_events_topic_message_thread_id',
  name: 'telegram_events_topic_name',
  lastPostAt: 'telegram_events_topic_last_post_at',
  lastPermissionRequestAt: 'telegram_events_topic_last_permission_request_at',
} as const

export class TelegramEventsTopicStore {
  constructor(private db: Db) {}

  getState(): TelegramEventsTopicState {
    this.ensureDefaults()
    const messageThreadIdRaw = this.getSetting(KEYS.messageThreadId)
    const parsedThreadId = messageThreadIdRaw ? Number(messageThreadIdRaw) : undefined

    return {
      chatId: this.getSetting(KEYS.chatId),
      messageThreadId: Number.isFinite(parsedThreadId) ? parsedThreadId : undefined,
      name: this.getSetting(KEYS.name) || 'Events',
      lastPostAt: this.getSetting(KEYS.lastPostAt),
      lastPermissionRequestAt: this.getSetting(KEYS.lastPermissionRequestAt),
    }
  }

  saveTopic(chatId: string, messageThreadId: number, name = 'Events') {
    this.setSetting(KEYS.chatId, chatId)
    this.setSetting(KEYS.messageThreadId, String(messageThreadId))
    this.setSetting(KEYS.name, name)
  }

  markPosted(at = new Date()) {
    this.setSetting(KEYS.lastPostAt, at.toISOString())
  }

  markPermissionRequested(at = new Date()) {
    this.setSetting(KEYS.lastPermissionRequestAt, at.toISOString())
  }

  canPostNow(now = new Date(), cooldownMs = 60 * 60 * 1000): boolean {
    const state = this.getState()
    if (!state.lastPostAt) return true
    return now.getTime() - new Date(state.lastPostAt).getTime() >= cooldownMs
  }

  shouldAskForPermissions(now = new Date(), cooldownMs = 6 * 60 * 60 * 1000): boolean {
    const state = this.getState()
    if (!state.lastPermissionRequestAt) return true
    return now.getTime() - new Date(state.lastPermissionRequestAt).getTime() >= cooldownMs
  }

  private ensureDefaults() {
    this.setSetting(KEYS.name, 'Events', true)
  }

  private getSetting(key: string): string | undefined {
    const row = this.db.select().from(communitySettings).where(eq(communitySettings.key, key)).get()
    return row?.value
  }

  private setSetting(key: string, value: string, onlyIfMissing = false) {
    const existing = this.db.select().from(communitySettings).where(eq(communitySettings.key, key)).get()
    if (existing) {
      if (onlyIfMissing) return
      this.db.update(communitySettings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(communitySettings.key, key))
        .run()
      return
    }

    this.db.insert(communitySettings).values({
      key,
      value,
      updatedAt: new Date().toISOString(),
    }).run()
  }
}
