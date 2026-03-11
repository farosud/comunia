import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db/index.js'
import { users, events, rsvps, feedback, userMemory, research, importLog } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('database', () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(':memory:')
  })

  it('creates a user and retrieves it', () => {
    db.insert(users).values({
      id: 'u1', name: 'Test User', telegramId: 'tg_123',
      status: 'active', joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }).run()

    const result = db.select().from(users).where(eq(users.id, 'u1')).get()
    expect(result?.name).toBe('Test User')
  })

  it('creates an event with RSVPs', () => {
    db.insert(users).values({
      id: 'u1', name: 'User', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()

    db.insert(events).values({
      id: 'e1', title: 'Asado', type: 'asado', status: 'draft',
      proposedBy: 'u1', date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
      createdAt: new Date().toISOString(),
    }).run()

    db.insert(rsvps).values({
      id: 'r1', eventId: 'e1', userId: 'u1', status: 'yes',
      respondedAt: new Date().toISOString(),
    }).run()

    const eventRsvps = db.select().from(rsvps).where(eq(rsvps.eventId, 'e1')).all()
    expect(eventRsvps).toHaveLength(1)
  })

  it('stores user memory entries', () => {
    db.insert(users).values({
      id: 'u1', name: 'User', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()

    db.insert(userMemory).values({
      id: 'm1', userId: 'u1', category: 'preferences',
      key: 'food_preference', value: 'vegetarian',
      confidence: 0.9, source: 'user_said',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).run()

    const memories = db.select().from(userMemory).where(eq(userMemory.userId, 'u1')).all()
    expect(memories).toHaveLength(1)
    expect(memories[0].value).toBe('vegetarian')
  })

  it('stores research data', () => {
    db.insert(research).values({
      id: 'r1', category: 'venues', eventType: 'asado',
      data: JSON.stringify({ name: 'Rosedal', capacity: 50 }),
      source: 'web_search', researchedAt: new Date().toISOString(),
    }).run()

    const results = db.select().from(research).where(eq(research.category, 'venues')).all()
    expect(results).toHaveLength(1)
  })

  it('tracks imports', () => {
    db.insert(importLog).values({
      id: 'i1', sourceFile: 'whatsapp-export.txt', type: 'whatsapp',
      status: 'completed',
      error: null,
      messagesProcessed: 14000, membersProcessed: 127,
      entriesExtracted: 523,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
    }).run()

    const logs = db.select().from(importLog).all()
    expect(logs).toHaveLength(1)
    expect(logs[0].messagesProcessed).toBe(14000)
    expect(logs[0].status).toBe('completed')
  })

  it('creates the parent directory for file-backed databases', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-db-'))
    const dbPath = path.join(tempDir, 'nested', 'comunia.db')

    createDb(dbPath)

    expect(fs.existsSync(path.dirname(dbPath))).toBe(true)
    expect(fs.existsSync(dbPath)).toBe(true)

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
