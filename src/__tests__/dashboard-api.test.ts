import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApiRoutes } from '../dashboard/api.js'
import { EventManager } from '../events/manager.js'
import { UserMemory } from '../memory/user-memory.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { ReasoningStream } from '../reasoning.js'
import { HealthMonitor } from '../health.js'
import { createDb } from '../db/index.js'
import { users, events, importLog } from '../db/schema.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Dashboard API', () => {
  let db: ReturnType<typeof createDb>
  let tmpDir: string
  let api: ReturnType<typeof createApiRoutes>

  beforeEach(() => {
    db = createDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-test-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul\nTest soul.')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory\nTest memory.')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent\nTest agent.')

    db.insert(users).values({ id: 'u1', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()

    api = createApiRoutes({
      db,
      eventManager: new EventManager(db),
      userMemory: new UserMemory(db),
      agentMemory: new AgentMemory(tmpDir),
      reasoning: new ReasoningStream(),
      health: new HealthMonitor(),
      config: {
        community: { name: 'Comunia', type: 'local', location: 'Buenos Aires' },
        publicPortal: { passcode: 'community-123', botUrl: 'https://t.me/comunia_bot' },
      } as any,
    })
  })

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }) })

  it('GET /health returns health status', async () => {
    const res = await api.request('/health')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBeDefined()
  })

  it('GET /overview returns community stats', async () => {
    const res = await api.request('/overview')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.members).toBe(1)
  })

  it('GET /community/public-settings returns public portal settings', async () => {
    const res = await api.request('/community/public-settings')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.passcode).toBe('community-123')
    expect(data.botUrl).toBe('https://t.me/comunia_bot')
  })

  it('PUT /community/public-settings updates public portal settings', async () => {
    const res = await api.request('/community/public-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'new-code', botUrl: 'https://t.me/new_bot' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.passcode).toBe('new-code')
    expect(data.botUrl).toBe('https://t.me/new_bot')
  })

  it('POST /cloud/publish-credentials provisions a slug-specific publish token', async () => {
    const res = await api.request('/cloud/publish-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'founders-ba', communityName: 'Founders BA' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.slug).toBe('founders-ba')
    expect(data.token.startsWith('cp_')).toBe(true)

    const list = await api.request('/cloud/publish-credentials')
    const listData = await list.json()
    expect(listData).toHaveLength(1)
    expect(listData[0].slug).toBe('founders-ba')
    expect(listData[0].tokenPreview).toContain('...')
  })

  it('GET /members returns members with profiles', async () => {
    const res = await api.request('/members')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Emi')
    expect(data[0].memoryFilePath).toContain('/users/u1/memory.md')
  })

  it('GET /members/:id/memory returns generated markdown memory for that member', async () => {
    const res = await api.request('/members/u1/memory')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.path).toContain('/users/u1/memory.md')
    expect(data.content).toContain('# Emi - Memory')
  })

  it('GET /events returns all events', async () => {
    const res = await api.request('/events')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /events/drafts returns draft events', async () => {
    const res = await api.request('/events/drafts')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /events/proposals returns proposed events', async () => {
    db.insert(events).values({
      id: 'p1',
      title: 'Asado',
      type: 'asado',
      status: 'proposed',
      proposedBy: 'u1',
      date: 'TBD',
      createdAt: new Date().toISOString(),
    }).run()

    const res = await api.request('/events/proposals')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(1)
    expect(data[0].status).toBe('proposed')
  })

  it('POST /events/:id/approve approves event', async () => {
    const eventMgr = new EventManager(db)
    const event = await eventMgr.create({
      title: 'Test', type: 'dinner', proposedBy: 'u1',
      date: '2026-03-15T20:00:00Z', maxCapacity: 10, minCapacity: 1, budget: 'low',
    })

    const res = await api.request(`/events/${event.id}/approve`, { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('approved')
  })

  it('POST /events/:id/reject rejects event', async () => {
    const eventMgr = new EventManager(db)
    const event = await eventMgr.create({
      title: 'Test', type: 'dinner', proposedBy: 'u1',
      date: '2026-03-15T20:00:00Z', maxCapacity: 10, minCapacity: 1, budget: 'low',
    })

    const res = await api.request(`/events/${event.id}/reject`, { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('rejected')
  })

  it('GET /agent/soul returns soul.md content', async () => {
    const res = await api.request('/agent/soul')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.content).toContain('Test soul')
  })

  it('PUT /agent/soul updates soul.md', async () => {
    const res = await api.request('/agent/soul', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# New Soul' }),
    })
    expect(res.status).toBe(200)

    const check = await api.request('/agent/soul')
    const data = await check.json()
    expect(data.content).toBe('# New Soul')
  })

  it('GET /agent/memory returns memory.md content', async () => {
    const res = await api.request('/agent/memory')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.content).toContain('Test memory')
  })

  it('PUT /agent/memory updates memory.md', async () => {
    const res = await api.request('/agent/memory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# Memory\nUpdated memory.' }),
    })
    expect(res.status).toBe(200)

    const check = await api.request('/agent/memory')
    const data = await check.json()
    expect(data.content).toBe('# Memory\nUpdated memory.')
  })

  it('GET /agent/agent returns agent.md content', async () => {
    const res = await api.request('/agent/agent')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.content).toContain('Test agent')
  })

  it('PUT /agent/agent updates agent.md', async () => {
    const res = await api.request('/agent/agent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# Agent\nUpdated agent.' }),
    })
    expect(res.status).toBe(200)

    const check = await api.request('/agent/agent')
    const data = await check.json()
    expect(data.content).toBe('# Agent\nUpdated agent.')
  })

  it('GET /import/history returns import logs', async () => {
    db.insert(importLog).values({
      id: 'import-1',
      sourceFile: 'result.json',
      type: 'telegram-export',
      status: 'processing',
      error: null,
      messagesProcessed: 10,
      membersProcessed: 3,
      entriesExtracted: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      importedAt: new Date().toISOString(),
    }).run()

    const res = await api.request('/import/history')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data[0].status).toBe('processing')
  })

  it('POST /reasoning/ask returns 503 when agent not initialized', async () => {
    const res = await api.request('/reasoning/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Why did you pick that event?' }),
    })
    expect(res.status).toBe(503)
    const data = await res.json()
    expect(data.error).toBe('Agent not initialized')
  })
})
