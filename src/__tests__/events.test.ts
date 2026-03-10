import { describe, it, expect, beforeEach } from 'vitest'
import { EventManager } from '../events/manager.js'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'

describe('EventManager', () => {
  let db: ReturnType<typeof createDb>
  let mgr: EventManager

  beforeEach(() => {
    db = createDb(':memory:')
    mgr = new EventManager(db)

    db.insert(users).values({ id: 'u1', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
    db.insert(users).values({ id: 'u2', name: 'Ana', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
  })

  it('creates event as draft by default', async () => {
    const event = await mgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })
    expect(event.status).toBe('draft')
  })

  it('admin approves event → status becomes approved', async () => {
    const event = await mgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })
    await mgr.approve(event.id)
    const updated = await mgr.getById(event.id)
    expect(updated?.status).toBe('approved')
  })

  it('announce transitions approved → announced', async () => {
    const event = await mgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })
    await mgr.approve(event.id)
    await mgr.announce(event.id)
    const updated = await mgr.getById(event.id)
    expect(updated?.status).toBe('announced')
  })

  it('rejects announcing a draft event', async () => {
    const event = await mgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })
    await expect(mgr.announce(event.id)).rejects.toThrow('must be approved')
  })

  it('handles RSVPs on announced events', async () => {
    const event = await mgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })
    await mgr.approve(event.id)
    await mgr.announce(event.id)

    await mgr.rsvp(event.id, 'u1', 'yes')
    await mgr.rsvp(event.id, 'u2', 'maybe')

    const attendees = await mgr.getRsvps(event.id)
    expect(attendees).toHaveLength(2)
  })

  it('auto-confirms when minCapacity met', async () => {
    const event = await mgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 2, budget: 'low',
    })
    await mgr.approve(event.id)
    await mgr.announce(event.id)

    await mgr.rsvp(event.id, 'u1', 'yes')
    await mgr.rsvp(event.id, 'u2', 'yes')

    const updated = await mgr.getById(event.id)
    expect(updated?.status).toBe('confirmed')
  })

  it('waitlists when maxCapacity reached', async () => {
    const event = await mgr.create({
      title: 'Cena', type: 'dinner', proposedBy: 'u1',
      date: '2026-03-15T20:00:00Z', location: 'Recoleta',
      maxCapacity: 1, minCapacity: 1, budget: 'medium',
    })
    await mgr.approve(event.id)
    await mgr.announce(event.id)

    await mgr.rsvp(event.id, 'u1', 'yes')
    const result = await mgr.rsvp(event.id, 'u2', 'yes')
    expect(result.status).toBe('waitlist')
  })

  it('stores score and agent notes', async () => {
    const event = await mgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })
    await mgr.setScore(event.id, 8.7, { historicalFit: 9, audienceMatch: 8 }, 'Saturday asados perform well')

    const updated = await mgr.getById(event.id)
    expect(updated?.score).toBe(8.7)
    expect(updated?.agentNotes).toContain('Saturday asados')
  })

  it('lists drafts awaiting approval', async () => {
    await mgr.create({ title: 'Draft1', type: 'dinner', proposedBy: 'u1',
      date: '2030-01-01T12:00:00Z', location: 'X', maxCapacity: 10, minCapacity: 1, budget: 'low' })
    await mgr.create({ title: 'Draft2', type: 'asado', proposedBy: 'agent',
      date: '2030-01-02T12:00:00Z', location: 'Y', maxCapacity: 10, minCapacity: 1, budget: 'low' })

    const drafts = await mgr.getDrafts()
    expect(drafts).toHaveLength(2)
  })
})
