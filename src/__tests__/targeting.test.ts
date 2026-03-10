import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SmartTargeting } from '../events/targeting.js'
import { EventManager } from '../events/manager.js'
import { UserMemory } from '../memory/user-memory.js'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { ReasoningStream } from '../reasoning.js'

describe('SmartTargeting', () => {
  let db: ReturnType<typeof createDb>
  let eventMgr: EventManager
  let userMem: UserMemory
  let reasoning: ReasoningStream
  let sendDm: ReturnType<typeof vi.fn>

  const mockLlm = {
    name: 'mock',
    chat: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        matches: [
          { userId: 'u1', score: 0.9, reason: 'Loves asados and lives in Palermo' },
          { userId: 'u2', score: 0.5, reason: 'Might be interested but prefers weekdays' },
        ],
      }),
      toolCalls: [],
    }),
  }

  beforeEach(() => {
    db = createDb(':memory:')
    eventMgr = new EventManager(db)
    userMem = new UserMemory(db)
    reasoning = new ReasoningStream()
    sendDm = vi.fn()

    db.insert(users).values({ id: 'u1', name: 'Emi', status: 'active', telegramId: 'tg_1',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
    db.insert(users).values({ id: 'u2', name: 'Ana', status: 'active', telegramId: 'tg_2',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
  })

  it('sends DMs only to high-match members', async () => {
    const targeting = new SmartTargeting(mockLlm as any, eventMgr, userMem, reasoning, sendDm, db)

    const event = await eventMgr.create({
      title: 'Asado en Palermo', type: 'asado', proposedBy: 'agent',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })

    await targeting.targetForEvent(event.id)

    // Only u1 (score 0.9) should get a DM, not u2 (score 0.5 < 0.6 threshold)
    expect(sendDm).toHaveBeenCalledTimes(1)
    expect(sendDm).toHaveBeenCalledWith('tg_1', expect.stringContaining('Asado'))
  })

  it('streams reasoning during targeting', async () => {
    const handler = vi.fn()
    reasoning.on('reasoning', handler)

    const targeting = new SmartTargeting(mockLlm as any, eventMgr, userMem, reasoning, sendDm, db)

    const event = await eventMgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'agent',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })

    await targeting.targetForEvent(event.id)

    const messages = handler.mock.calls.map((c: any) => c[0].message)
    expect(messages.some((m: string) => m.includes('targeting')  || m.includes('Targeting'))).toBe(true)
  })

  it('returns targeting results', async () => {
    const targeting = new SmartTargeting(mockLlm as any, eventMgr, userMem, reasoning, sendDm, db)

    const event = await eventMgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'agent',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })

    const results = await targeting.targetForEvent(event.id)
    expect(results.targeted).toBe(1)
    expect(results.skipped).toBe(1)
  })
})
