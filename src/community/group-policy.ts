import { eq } from 'drizzle-orm'
import { communitySettings } from '../db/schema.js'

type Db = any

export type GroupResponseMode = 'announcements_only' | 'admin_only' | 'open'

export interface GroupInteractionSettings {
  responseMode: GroupResponseMode
  allowTelegramTopicCreation: boolean
}

export class GroupPolicy {
  constructor(private db: Db) {}

  async getSettings(): Promise<GroupInteractionSettings> {
    await this.ensureDefaults()
    const row = this.db.select().from(communitySettings)
      .where(eq(communitySettings.key, 'group_response_mode'))
      .get()
    const topicCreationRow = this.db.select().from(communitySettings)
      .where(eq(communitySettings.key, 'telegram_topic_creation_enabled'))
      .get()

    return {
      responseMode: normalizeMode(row?.value),
      allowTelegramTopicCreation: topicCreationRow?.value === 'true',
    }
  }

  async updateSettings(input: Partial<GroupInteractionSettings>): Promise<GroupInteractionSettings> {
    const current = await this.getSettings()
    const next = {
      responseMode: input.responseMode ? normalizeMode(input.responseMode) : current.responseMode,
      allowTelegramTopicCreation: input.allowTelegramTopicCreation ?? current.allowTelegramTopicCreation,
    }

    this.setSetting('group_response_mode', next.responseMode)
    this.setSetting('telegram_topic_creation_enabled', next.allowTelegramTopicCreation ? 'true' : 'false')
    return next
  }

  async shouldRespondToGroupMessage(input: {
    userId: string
    text: string
    replyTo?: string
    adminIds: string[]
  }): Promise<boolean> {
    const settings = await this.getSettings()
    if (settings.responseMode === 'open') return true
    if (settings.responseMode === 'announcements_only') return false

    const isAdmin = input.adminIds.includes(input.userId)
    if (!isAdmin) return false
    if (input.replyTo) return true

    return isExplicitInvocation(input.text)
  }

  async shouldSendIntro(platform: 'telegram' | 'whatsapp', chatId: string): Promise<boolean> {
    await this.ensureDefaults()
    const key = introKey(platform, chatId)
    const row = this.db.select().from(communitySettings)
      .where(eq(communitySettings.key, key))
      .get()
    return row?.value !== 'true'
  }

  async markIntroSent(platform: 'telegram' | 'whatsapp', chatId: string) {
    this.setSetting(introKey(platform, chatId), 'true')
  }

  private async ensureDefaults() {
    this.setSetting('group_response_mode', 'admin_only', true)
    this.setSetting('telegram_topic_creation_enabled', 'false', true)
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

function introKey(platform: 'telegram' | 'whatsapp', chatId: string) {
  return `group_intro_sent:${platform}:${chatId}`
}

function normalizeMode(value?: string): GroupResponseMode {
  if (value === 'open') return 'open'
  if (value === 'announcements_only') return 'announcements_only'
  return 'admin_only'
}

function isExplicitInvocation(text: string): boolean {
  return /\b(comunia|community manager|community agent|agent)\b/i.test(text)
}
