import { eq } from 'drizzle-orm'
import { communitySettings } from '../db/schema.js'

type Db = any

export type GroupResponseMode = 'admin_only' | 'open'

export interface GroupInteractionSettings {
  responseMode: GroupResponseMode
}

export class GroupPolicy {
  constructor(private db: Db) {}

  async getSettings(): Promise<GroupInteractionSettings> {
    await this.ensureDefaults()
    const row = this.db.select().from(communitySettings)
      .where(eq(communitySettings.key, 'group_response_mode'))
      .get()

    return {
      responseMode: row?.value === 'open' ? 'open' : 'admin_only',
    }
  }

  async updateSettings(input: Partial<GroupInteractionSettings>): Promise<GroupInteractionSettings> {
    const current = await this.getSettings()
    const next = {
      responseMode: input.responseMode === 'open' ? 'open' : current.responseMode,
    }

    this.setSetting('group_response_mode', next.responseMode)
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

function isExplicitInvocation(text: string): boolean {
  return /\b(comunia|community manager|community agent|agent)\b/i.test(text)
}
