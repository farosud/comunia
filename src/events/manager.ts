import { eq, and, gt } from 'drizzle-orm'
import { events, rsvps } from '../db/schema.js'
import { randomUUID } from 'crypto'

type Db = any

interface CreateEventInput {
  title: string
  description?: string
  type: string
  proposedBy: string
  date: string
  location?: string
  maxCapacity?: number
  minCapacity?: number
  budget?: string
}

export class EventManager {
  private db: Db

  constructor(db: Db) { this.db = db }

  async create(input: CreateEventInput) {
    const id = randomUUID()
    const event = { id, ...input, status: 'draft', createdAt: new Date().toISOString() }
    this.db.insert(events).values(event).run()
    return event
  }

  async getById(id: string) {
    return this.db.select().from(events).where(eq(events.id, id)).get()
  }

  async approve(id: string) {
    this.db.update(events).set({ status: 'approved' }).where(eq(events.id, id)).run()
  }

  async announce(id: string) {
    const event = await this.getById(id)
    if (!event || event.status !== 'approved') throw new Error('Event must be approved before announcing')
    this.db.update(events).set({ status: 'announced' }).where(eq(events.id, id)).run()
  }

  async setScore(id: string, score: number, breakdown: Record<string, number>, notes: string) {
    this.db.update(events).set({
      score,
      scoreBreakdown: JSON.stringify(breakdown),
      agentNotes: notes,
    }).where(eq(events.id, id)).run()
  }

  async rsvp(eventId: string, userId: string, status: 'yes' | 'no' | 'maybe') {
    const event = await this.getById(eventId)
    if (!event) throw new Error('Event not found')

    if (status === 'yes' && event.maxCapacity) {
      const yesCount = this.db.select().from(rsvps)
        .where(and(eq(rsvps.eventId, eventId), eq(rsvps.status, 'yes'))).all().length
      if (yesCount >= event.maxCapacity) {
        const record = { id: randomUUID(), eventId, userId, status: 'waitlist', respondedAt: new Date().toISOString() }
        this.db.insert(rsvps).values(record).run()
        return record
      }
    }

    const existing = this.db.select().from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.userId, userId))).get()
    const now = new Date().toISOString()
    let record

    if (existing) {
      this.db.update(rsvps).set({ status, respondedAt: now }).where(eq(rsvps.id, existing.id)).run()
      record = { ...existing, status, respondedAt: now }
    } else {
      record = { id: randomUUID(), eventId, userId, status, respondedAt: now }
      this.db.insert(rsvps).values(record).run()
    }

    if (status === 'yes' && event.minCapacity &&
        (event.status === 'announced' || event.status === 'approved')) {
      const yesCount = this.db.select().from(rsvps)
        .where(and(eq(rsvps.eventId, eventId), eq(rsvps.status, 'yes'))).all().length
      if (yesCount >= event.minCapacity) {
        this.db.update(events).set({ status: 'confirmed' }).where(eq(events.id, eventId)).run()
      }
    }

    return record
  }

  async getRsvps(eventId: string) {
    return this.db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).all()
  }

  async complete(eventId: string) {
    this.db.update(events).set({ status: 'completed' }).where(eq(events.id, eventId)).run()
  }

  async cancel(eventId: string, _reason: string) {
    const affected = this.db.select().from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.status, 'yes'))).all()
    this.db.update(events).set({ status: 'cancelled' }).where(eq(events.id, eventId)).run()
    return affected
  }

  async getDrafts() {
    return this.db.select().from(events).where(eq(events.status, 'draft')).all()
  }

  async getUpcoming() {
    return this.db.select().from(events)
      .where(gt(events.date, new Date().toISOString())).all()
      .filter((e: any) => !['cancelled', 'completed', 'draft'].includes(e.status))
  }

  async getRecent(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    return this.db.select().from(events)
      .where(gt(events.createdAt, since)).all()
  }
}
