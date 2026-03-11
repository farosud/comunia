import type { AnalysisResult } from './analyzer.js'
import type { ParseResult, ParsedMember } from './parsers/types.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import { users } from '../db/schema.js'
import { eq, or } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { UserProfileMemory } from '../memory/user-profile-memory.js'

type Db = any

export class ImportSeeder {
  private profileMemory: UserProfileMemory

  constructor(
    private db: Db,
    private userMemory: UserMemory,
    private agentMemory: AgentMemory,
  ) {
    this.profileMemory = new UserProfileMemory(db, userMemory, agentMemory)
  }

  async ingestMembers(parseResult: ParseResult): Promise<{ usersCreated: number; memoriesStored: number; touchedUserIds: string[] }> {
    let usersCreated = 0
    let memoriesStored = 0
    const touchedUserIds = new Set<string>()

    for (const member of parseResult.members) {
      const userResult = this.findOrCreateUser(member)
      if (userResult.created) {
        usersCreated++
      }
      touchedUserIds.add(userResult.user.id)
      memoriesStored += await this.storeImportedMemberMemory(userResult.user.id, member)
    }

    await this.syncProfiles(touchedUserIds)

    return {
      usersCreated,
      memoriesStored,
      touchedUserIds: Array.from(touchedUserIds),
    }
  }

  async enrichMembers(parseResult: ParseResult, analysis: AnalysisResult): Promise<{ usersCreated: number; memoriesStored: number; touchedUserIds: string[] }> {
    let usersCreated = 0
    let memoriesStored = 0
    const touchedUserIds = new Set<string>()
    const profilesByName = new Map(analysis.memberProfiles.map((profile) => [normalizeName(profile.name), profile]))

    for (const member of parseResult.members) {
      const profile = profilesByName.get(normalizeName(member.name))
      if (!profile) continue

      const userResult = this.findOrCreateUser(member)
      touchedUserIds.add(userResult.user.id)
      memoriesStored += await this.storeImportedProfileMemory(userResult.user.id, profile)
    }

    for (const profile of analysis.memberProfiles) {
      const alreadyHandled = parseResult.members.some((member) => normalizeName(member.name) === normalizeName(profile.name))
      if (alreadyHandled) continue

      const userResult = this.findOrCreateUser({ name: profile.name })
      if (userResult.created) {
        usersCreated++
      }
      touchedUserIds.add(userResult.user.id)
      memoriesStored += await this.storeImportedProfileMemory(userResult.user.id, profile)
    }

    if (analysis.suggestedMemory) {
      const currentMemory = await this.agentMemory.getMemory()
      if (currentMemory.includes('Nothing yet') || currentMemory.trim() === '# Memory') {
        await this.agentMemory.updateMemory(analysis.suggestedMemory)
      }
    }

    await this.syncProfiles(touchedUserIds)

    return {
      usersCreated,
      memoriesStored,
      touchedUserIds: Array.from(touchedUserIds),
    }
  }

  async seed(parseResult: ParseResult, analysis: AnalysisResult, _source: string): Promise<{ usersCreated: number; memoriesStored: number }> {
    const quickPass = await this.ingestMembers(parseResult)
    const enrichment = await this.enrichMembers(parseResult, analysis)

    return {
      usersCreated: quickPass.usersCreated + enrichment.usersCreated,
      memoriesStored: quickPass.memoriesStored + enrichment.memoriesStored,
    }
  }

  private findOrCreateUser(member?: ParsedMember): { user: any; created: boolean } {
    const platformIds = normalizePlatformIds(member)
    let existing = platformIds.telegramId
      ? this.db.select().from(users).where(eq(users.telegramId, platformIds.telegramId)).get()
      : undefined

    if (!existing && platformIds.whatsappId) {
      existing = this.db.select().from(users).where(eq(users.whatsappId, platformIds.whatsappId)).get()
    }

    if (!existing && member?.name) {
      existing = this.db.select().from(users).where(eq(users.name, member.name)).get()
    }

    const joinedAt = member?.firstMessageAt?.toISOString() || new Date().toISOString()
    const lastActiveAt = member?.lastMessageAt?.toISOString() || joinedAt

    if (existing) {
      this.db.update(users).set({
        name: member?.name || existing.name,
        telegramId: platformIds.telegramId || existing.telegramId,
        whatsappId: platformIds.whatsappId || existing.whatsappId,
        lastActiveAt,
        status: 'active',
      }).where(eq(users.id, existing.id)).run()

      const updated = this.db.select().from(users)
        .where(or(eq(users.id, existing.id), eq(users.name, member?.name || existing.name)))
        .get()

      return { user: updated || existing, created: false }
    }

    const id = randomUUID()
    this.db.insert(users).values({
      id,
      name: member?.name || 'Unknown',
      telegramId: platformIds.telegramId,
      whatsappId: platformIds.whatsappId,
      status: 'active',
      joinedAt,
      lastActiveAt,
    }).run()

    return {
      user: this.db.select().from(users).where(eq(users.id, id)).get(),
      created: true,
    }
  }

  private async storeImportedMemberMemory(userId: string, member?: ParsedMember): Promise<number> {
    let stored = 0

    if (member?.platform) {
      await this.userMemory.set(userId, 'identity', 'source_platform', member.platform, 1, 'import')
      stored++
    }

    if (member?.messageCount !== undefined) {
      await this.userMemory.set(userId, 'activity', 'import_message_count', String(member.messageCount), 0.98, 'import')
      stored++
    }

    if (member?.lastMessageAt) {
      await this.userMemory.set(userId, 'activity', 'import_last_seen', member.lastMessageAt.toISOString(), 0.98, 'import')
      stored++
    }

    return stored
  }

  private async storeImportedProfileMemory(userId: string, profile?: AnalysisResult['memberProfiles'][number]): Promise<number> {
    let stored = 0

    if (profile?.summary) {
      await this.userMemory.set(userId, 'summary', 'import_profile', profile.summary, 0.8, 'import')
      stored++
    }

    for (const trait of profile?.traits || []) {
      await this.userMemory.set(
        userId, trait.category, trait.key, trait.value, trait.confidence, 'import',
      )
      stored++
    }

    return stored
  }

  private async syncProfiles(userIds: Set<string>): Promise<void> {
    await Promise.all(Array.from(userIds).map((userId) => this.profileMemory.sync(userId)))
  }
}

function normalizePlatformIds(member?: ParsedMember): { telegramId?: string; whatsappId?: string } {
  if (!member?.platformId || !member.platform) return {}

  if (member.platform === 'telegram') {
    return {
      telegramId: `tg_${member.platformId.replace(/^user/i, '')}`,
    }
  }

  if (member.platform === 'whatsapp') {
    return {
      whatsappId: `wa_${member.platformId.replace(/^wa_/i, '')}`,
    }
  }

  return {}
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
