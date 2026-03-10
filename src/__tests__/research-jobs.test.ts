import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVenueResearchJob } from '../scheduler/jobs/venue-research.js'
import { createEventIdeationJob } from '../scheduler/jobs/event-ideation.js'
import { createSubgroupAnalysisJob } from '../scheduler/jobs/subgroup-analysis.js'
import { createProfileEnrichmentJob } from '../scheduler/jobs/profile-enrichment.js'
import type { JobContext } from '../scheduler/jobs/types.js'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { UserMemory } from '../memory/user-memory.js'
import { EventManager } from '../events/manager.js'
import { ReasoningStream } from '../reasoning.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

function createMockContext(db: any, tmpDir: string, communityType = 'local'): JobContext {
  return {
    llm: {
      name: 'mock',
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify([{ name: 'Test Venue', type: 'restaurant', description: 'Good vibes', capacity: 20, priceRange: 'medium', bestFor: 'dinner' }]),
        toolCalls: [],
      }),
    } as any,
    eventManager: new EventManager(db),
    userMemory: new UserMemory(db),
    agentMemory: new AgentMemory(tmpDir),
    reasoning: new ReasoningStream(),
    config: {
      community: { name: 'Test', language: 'en', type: communityType, location: 'Buenos Aires', adminUserIds: [] },
      scheduler: { reminderHoursBefore: [48, 2], feedbackDelayHours: 24, digestCron: '0 10 * * 1', reflectionCron: '0 3 * * *', venueResearchCron: '0 9 * * 3', eventIdeationCron: '0 10 * * 1', subgroupAnalysisCron: '0 4 * * 0' },
    } as any,
    sendDm: vi.fn(),
    sendGroup: vi.fn(),
    db,
    reason: vi.fn(),
  }
}

describe('Research Jobs', () => {
  let db: ReturnType<typeof createDb>
  let tmpDir: string

  beforeEach(() => {
    db = createDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-test-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')

    db.insert(users).values({ id: 'u1', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
  })

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }) })

  it('venue research runs for local communities', async () => {
    const ctx = createMockContext(db, tmpDir, 'local')
    const job = createVenueResearchJob('0 9 * * 3')
    await job.run(ctx)
    expect(ctx.llm.chat).toHaveBeenCalled()
    expect(ctx.reason).toHaveBeenCalledWith('venue-research', 'step', expect.stringContaining('Starting'))
  })

  it('venue research skips for distributed communities', async () => {
    const ctx = createMockContext(db, tmpDir, 'distributed')
    const job = createVenueResearchJob('0 9 * * 3')
    await job.run(ctx)
    expect(ctx.llm.chat).not.toHaveBeenCalled()
    expect(ctx.reason).toHaveBeenCalledWith('venue-research', 'step', expect.stringContaining('Skipping'))
  })

  it('event ideation creates draft events', async () => {
    const ctx = createMockContext(db, tmpDir)
    ;(ctx.llm.chat as any).mockResolvedValueOnce({
      text: JSON.stringify([{ title: 'Friday Asado', type: 'asado', date: '2026-03-20T18:00:00Z', location: 'Palermo', reasoning: 'Popular day' }]),
      toolCalls: [],
    })

    const job = createEventIdeationJob('0 10 * * 1')
    await job.run(ctx)

    const drafts = await ctx.eventManager.getDrafts()
    expect(drafts.length).toBeGreaterThanOrEqual(1)
  })

  it('subgroup analysis identifies clusters', async () => {
    const ctx = createMockContext(db, tmpDir)
    ;(ctx.llm.chat as any).mockResolvedValueOnce({
      text: JSON.stringify({ clusters: [{ name: 'Foodies', members: ['u1'], commonInterests: ['food'], suggestedEventType: 'dinner' }] }),
      toolCalls: [],
    })

    const job = createSubgroupAnalysisJob('0 4 * * 0')
    await job.run(ctx)

    expect(ctx.reason).toHaveBeenCalledWith('subgroups', 'correlation', expect.stringContaining('Foodies'), expect.any(Object))
  })

  it('profile enrichment runs without errors', async () => {
    const ctx = createMockContext(db, tmpDir)
    const job = createProfileEnrichmentJob()
    await expect(job.run(ctx)).resolves.not.toThrow()
  })
})
