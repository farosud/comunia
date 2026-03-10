import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AgentMemory } from '../memory/agent-memory.js'
import { UserMemory } from '../memory/user-memory.js'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('AgentMemory', () => {
  let tmpDir: string
  let agentMemory: AgentMemory

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-test-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul\nYou are a test agent.')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory\nNothing yet.')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent\nTest capabilities.')
    agentMemory = new AgentMemory(tmpDir)
  })

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }) })

  it('reads soul.md', async () => {
    const soul = await agentMemory.getSoul()
    expect(soul).toContain('You are a test agent')
  })

  it('reads and updates memory.md', async () => {
    await agentMemory.updateMemory('# Memory\nAsados work best on Saturdays.')
    const updated = await agentMemory.getMemory()
    expect(updated).toContain('Asados work best on Saturdays')
  })

  it('updates soul.md', async () => {
    await agentMemory.updateSoul('# Soul\nNew personality.')
    const soul = await agentMemory.getSoul()
    expect(soul).toContain('New personality')
  })

  it('reads all files at once', async () => {
    const all = await agentMemory.getAll()
    expect(all.soul).toContain('test agent')
    expect(all.memory).toContain('Nothing yet')
    expect(all.agent).toContain('Test capabilities')
  })
})

describe('UserMemory', () => {
  let db: ReturnType<typeof createDb>
  let userMem: UserMemory

  beforeEach(() => {
    db = createDb(':memory:')
    userMem = new UserMemory(db)
    db.insert(users).values({
      id: 'u1', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()
  })

  it('stores and retrieves user memory', async () => {
    await userMem.set('u1', 'preferences', 'food', 'vegetarian', 0.9, 'user_said')
    const entries = await userMem.getAll('u1')
    expect(entries).toHaveLength(1)
    expect(entries[0].value).toBe('vegetarian')
  })

  it('updates existing memory entry', async () => {
    await userMem.set('u1', 'preferences', 'food', 'vegetarian', 0.9, 'user_said')
    await userMem.set('u1', 'preferences', 'food', 'vegan', 0.95, 'user_said')
    const entries = await userMem.getAll('u1')
    expect(entries).toHaveLength(1)
    expect(entries[0].value).toBe('vegan')
  })

  it('retrieves by category', async () => {
    await userMem.set('u1', 'preferences', 'food', 'vegan', 0.9, 'user_said')
    await userMem.set('u1', 'personality', 'occupation', 'developer', 0.8, 'user_said')
    const prefs = await userMem.getByCategory('u1', 'preferences')
    expect(prefs).toHaveLength(1)
    expect(prefs[0].key).toBe('food')
  })

  it('formats memory as readable string', async () => {
    await userMem.set('u1', 'preferences', 'food', 'vegan', 0.9, 'user_said')
    await userMem.set('u1', 'preferences', 'location', 'Palermo', 0.7, 'inferred')
    const formatted = await userMem.formatForPrompt('u1')
    expect(formatted).toContain('food: vegan')
    expect(formatted).toContain('location: Palermo')
  })
})
