import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventScoringEngine } from '../agent/scoring.js'
import { EventManager } from '../events/manager.js'
import { UserMemory } from '../memory/user-memory.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { ReasoningStream } from '../reasoning.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('EventScoringEngine', () => {
  let db: ReturnType<typeof createDb>
  let eventMgr: EventManager
  let userMem: UserMemory
  let agentMem: AgentMemory
  let reasoning: ReasoningStream
  let tmpDir: string

  const mockLlm = {
    name: 'mock',
    chat: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        overall: 8.5,
        breakdown: { historicalFit: 9, audienceMatch: 8, timing: 8, location: 9, budget: 8, novelty: 8 },
        estimatedAttendance: { min: 8, max: 15, likely: 12 },
        targetMembers: ['u1', 'u2'],
        reasoning: 'Saturday asados are historically popular',
      }),
      toolCalls: [],
    }),
  }

  beforeEach(() => {
    db = createDb(':memory:')
    eventMgr = new EventManager(db)
    userMem = new UserMemory(db)
    reasoning = new ReasoningStream()

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-test-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory\nSaturday events perform well.')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')
    agentMem = new AgentMemory(tmpDir)

    db.insert(users).values({ id: 'u1', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
    db.insert(users).values({ id: 'u2', name: 'Ana', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
  })

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }) })

  it('scores an event and returns structured result', async () => {
    const engine = new EventScoringEngine(mockLlm as any, eventMgr, userMem, agentMem, reasoning)

    const event = await eventMgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })

    const score = await engine.scoreEvent(event.id)

    expect(score.overall).toBe(8.5)
    expect(score.breakdown.historicalFit).toBe(9)
    expect(score.estimatedAttendance.likely).toBe(12)
    expect(score.targetMembers).toContain('u1')
    expect(score.reasoning).toContain('Saturday')
  })

  it('stores score on the event', async () => {
    const engine = new EventScoringEngine(mockLlm as any, eventMgr, userMem, agentMem, reasoning)

    const event = await eventMgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })

    await engine.scoreEvent(event.id)

    const updated = await eventMgr.getById(event.id)
    expect(updated?.score).toBe(8.5)
    expect(updated?.agentNotes).toContain('Saturday')
  })

  it('emits reasoning events during scoring', async () => {
    const handler = vi.fn()
    reasoning.on('reasoning', handler)

    const engine = new EventScoringEngine(mockLlm as any, eventMgr, userMem, agentMem, reasoning)

    const event = await eventMgr.create({
      title: 'Asado', type: 'asado', proposedBy: 'u1',
      date: '2026-03-15T13:00:00Z', location: 'Palermo',
      maxCapacity: 15, minCapacity: 5, budget: 'low',
    })

    await engine.scoreEvent(event.id)

    expect(handler).toHaveBeenCalled()
    const messages = handler.mock.calls.map((c: any) => c[0].message)
    expect(messages.some((m: string) => m.includes('Scoring'))).toBe(true)
  })
})
