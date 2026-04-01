import { eq } from 'drizzle-orm'
import { communitySettings } from '../db/schema.js'
import type { Config } from '../config.js'

type Db = any

export interface CommunityProfile {
  city: string
  description: string
  interests: string
  eventSearchCriteria: string
  ideationNotes: string
}

const KEYS = {
  city: 'community_profile_city',
  description: 'community_profile_description',
  interests: 'community_profile_interests',
  eventSearchCriteria: 'community_profile_event_search_criteria',
  ideationNotes: 'community_profile_ideation_notes',
} as const

export class CommunityProfileStore {
  constructor(private db: Db, private config: Pick<Config, 'community'>) {}

  async getProfile(): Promise<CommunityProfile> {
    this.ensureDefaults()
    return {
      city: this.getSetting(KEYS.city) || this.config.community.location || '',
      description: this.getSetting(KEYS.description) || '',
      interests: this.getSetting(KEYS.interests) || '',
      eventSearchCriteria: this.getSetting(KEYS.eventSearchCriteria) || '',
      ideationNotes: this.getSetting(KEYS.ideationNotes) || '',
    }
  }

  async updateProfile(input: Partial<CommunityProfile>): Promise<CommunityProfile> {
    const current = await this.getProfile()
    const next: CommunityProfile = {
      city: normalizeText(input.city ?? current.city),
      description: normalizeText(input.description ?? current.description),
      interests: normalizeText(input.interests ?? current.interests),
      eventSearchCriteria: normalizeText(input.eventSearchCriteria ?? current.eventSearchCriteria),
      ideationNotes: normalizeText(input.ideationNotes ?? current.ideationNotes),
    }

    this.setSetting(KEYS.city, next.city)
    this.setSetting(KEYS.description, next.description)
    this.setSetting(KEYS.interests, next.interests)
    this.setSetting(KEYS.eventSearchCriteria, next.eventSearchCriteria)
    this.setSetting(KEYS.ideationNotes, next.ideationNotes)
    return next
  }

  async buildPromptContext(): Promise<string> {
    const profile = await this.getProfile()
    return [
      `Community name: ${this.config.community.name}`,
      `Community type: ${this.config.community.type}`,
      profile.city ? `City: ${profile.city}` : '',
      profile.description ? `Description: ${profile.description}` : '',
      profile.interests ? `Interests: ${profile.interests}` : '',
      profile.eventSearchCriteria ? `Search criteria: ${profile.eventSearchCriteria}` : '',
      profile.ideationNotes ? `Ideation notes: ${profile.ideationNotes}` : '',
    ].filter(Boolean).join('\n')
  }

  private ensureDefaults() {
    this.setSetting(KEYS.city, this.config.community.location || '', true)
    this.setSetting(KEYS.description, '', true)
    this.setSetting(KEYS.interests, '', true)
    this.setSetting(KEYS.eventSearchCriteria, '', true)
    this.setSetting(KEYS.ideationNotes, '', true)
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

function normalizeText(value: string): string {
  return String(value || '').trim()
}
