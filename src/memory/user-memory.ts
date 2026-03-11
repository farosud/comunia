import { eq, and, or } from 'drizzle-orm'
import { userMemory, users } from '../db/schema.js'
import { randomUUID } from 'crypto'

type Db = any

export class UserMemory {
  private db: Db

  constructor(db: Db) {
    this.db = db
  }

  async set(userId: string, category: string, key: string, value: string, confidence: number, source: string): Promise<void> {
    const resolvedUserId = await this.resolveUserId(userId)

    const existing = this.db.select().from(userMemory)
      .where(and(eq(userMemory.userId, resolvedUserId), eq(userMemory.category, category), eq(userMemory.key, key)))
      .get()

    const now = new Date().toISOString()

    if (existing) {
      this.db.update(userMemory)
        .set({ value, confidence, source, updatedAt: now })
        .where(eq(userMemory.id, existing.id)).run()
    } else {
      this.db.insert(userMemory).values({
        id: randomUUID(), userId: resolvedUserId, category, key, value, confidence, source,
        createdAt: now, updatedAt: now,
      }).run()
    }
  }

  async getAll(userId: string) {
    const resolvedUserId = await this.resolveUserId(userId)
    return this.db.select().from(userMemory).where(eq(userMemory.userId, resolvedUserId)).all()
  }

  async getByCategory(userId: string, category: string) {
    const resolvedUserId = await this.resolveUserId(userId)
    return this.db.select().from(userMemory)
      .where(and(eq(userMemory.userId, resolvedUserId), eq(userMemory.category, category))).all()
  }

  async formatForPrompt(userId: string): Promise<string> {
    const entries = await this.getAll(userId)
    if (entries.length === 0) return 'No information stored yet.'

    const byCategory = new Map<string, typeof entries>()
    for (const entry of entries) {
      const list = byCategory.get(entry.category) || []
      list.push(entry)
      byCategory.set(entry.category, list)
    }

    const lines: string[] = []
    for (const [category, items] of byCategory) {
      lines.push(`### ${category}`)
      for (const item of items) {
        lines.push(`- ${item.key}: ${item.value}`)
      }
    }
    return lines.join('\n')
  }

  async resolveUserId(userId: string): Promise<string> {
    const existingById = this.db.select().from(users).where(eq(users.id, userId)).get()
    if (existingById) return existingById.id

    const existingByPlatformId = this.db.select().from(users)
      .where(or(eq(users.telegramId, userId), eq(users.whatsappId, userId))).get()

    if (existingByPlatformId) return existingByPlatformId.id

    throw new Error(`Unknown user identifier: ${userId}`)
  }
}
