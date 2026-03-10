import { eq, and } from 'drizzle-orm'
import { userMemory } from '../db/schema.js'
import { randomUUID } from 'crypto'

type Db = any

export class UserMemory {
  private db: Db

  constructor(db: Db) {
    this.db = db
  }

  async set(userId: string, category: string, key: string, value: string, confidence: number, source: string): Promise<void> {
    const existing = this.db.select().from(userMemory)
      .where(and(eq(userMemory.userId, userId), eq(userMemory.category, category), eq(userMemory.key, key)))
      .get()

    const now = new Date().toISOString()

    if (existing) {
      this.db.update(userMemory)
        .set({ value, confidence, source, updatedAt: now })
        .where(eq(userMemory.id, existing.id)).run()
    } else {
      this.db.insert(userMemory).values({
        id: randomUUID(), userId, category, key, value, confidence, source,
        createdAt: now, updatedAt: now,
      }).run()
    }
  }

  async getAll(userId: string) {
    return this.db.select().from(userMemory).where(eq(userMemory.userId, userId)).all()
  }

  async getByCategory(userId: string, category: string) {
    return this.db.select().from(userMemory)
      .where(and(eq(userMemory.userId, userId), eq(userMemory.category, category))).all()
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
}
