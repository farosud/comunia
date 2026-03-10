import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSystemPrompt } from '../agent/prompts.js'
import { getToolDefinitions, executeTool } from '../agent/tools.js'
import { EventManager } from '../events/manager.js'
import { UserMemory } from '../memory/user-memory.js'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'

describe('buildSystemPrompt', () => {
  it('includes profiling directive', () => {
    const prompt = buildSystemPrompt({
      soul: 'soul', agent: 'agent', memory: 'memory',
      userContext: 'ctx', activeEvents: 'none', chatType: 'dm',
      communityType: 'local', communityLocation: 'Buenos Aires',
    })
    expect(prompt).toContain('Profiling Directive')
    expect(prompt).toContain('update_user_memory')
  })

  it('adjusts for distributed community', () => {
    const prompt = buildSystemPrompt({
      soul: 'soul', agent: 'agent', memory: 'memory',
      userContext: 'ctx', activeEvents: 'none', chatType: 'group',
      communityType: 'distributed',
    })
    expect(prompt).toContain('distributed')
    expect(prompt).toContain('online')
  })
})

describe('getToolDefinitions', () => {
  it('includes all agent tools including research tools', () => {
    const tools = getToolDefinitions()
    const names = tools.map(t => t.name)
    expect(names).toContain('create_event')
    expect(names).toContain('update_user_memory')
    expect(names).toContain('score_event')
    expect(names).toContain('find_matching_members')
    expect(names).toContain('propose_event_idea')
  })
})

describe('executeTool', () => {
  let db: ReturnType<typeof createDb>
  let eventMgr: EventManager

  beforeEach(() => {
    db = createDb(':memory:')
    eventMgr = new EventManager(db)
    db.insert(users).values({
      id: 'u1', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()
  })

  it('creates event as draft', async () => {
    const result = await executeTool('create_event', {
      title: 'Asado', type: 'asado', date: '2026-03-15T13:00:00Z',
      location: 'Palermo', maxCapacity: 15, minCapacity: 5, budget: 'low',
      proposedBy: 'u1',
    }, { eventManager: eventMgr, userMemory: new UserMemory(db), sendDm: vi.fn(), sendGroup: vi.fn() })

    expect(result).toContain('draft')
    expect(result).toContain('Asado')
  })
})
