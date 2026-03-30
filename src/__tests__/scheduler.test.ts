import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createReminderJob } from '../scheduler/jobs/reminders.js'
import { createFeedbackJob } from '../scheduler/jobs/feedback.js'
import { createReflectionJob } from '../scheduler/jobs/reflection.js'
import { createDigestJob } from '../scheduler/jobs/digest.js'
import { createReengagementJob } from '../scheduler/jobs/reengagement.js'
import { createTelegramMemberSyncJob } from '../scheduler/jobs/member-sync.js'
import { createProductIdeasJob } from '../scheduler/jobs/product-ideas.js'
import type { JobContext } from '../scheduler/jobs/types.js'
import { createDb } from '../db/index.js'
import { users, events, rsvps, feedback, importLog } from '../db/schema.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { UserMemory } from '../memory/user-memory.js'
import { EventManager } from '../events/manager.js'
import { ReasoningStream } from '../reasoning.js'
import { ProductIdeas } from '../community/product-ideas.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

function createMockContext(db: any, tmpDir: string): JobContext {
  const mockLlm = {
    name: 'mock',
    chat: vi.fn().mockResolvedValue({ text: 'Mock LLM response', toolCalls: [] }),
  }

  return {
    llm: mockLlm as any,
    eventManager: new EventManager(db),
    userMemory: new UserMemory(db),
    agentMemory: new AgentMemory(tmpDir),
    reasoning: new ReasoningStream(),
    config: {
      community: { name: 'Test', language: 'en', type: 'local', adminUserIds: [] },
      scheduler: { reminderHoursBefore: [48, 2], feedbackDelayHours: 24, digestCron: '0 10 * * 1', reflectionCron: '0 3 * * *', venueResearchCron: '0 9 * * 3', eventIdeationCron: '0 10 * * 1', subgroupAnalysisCron: '0 4 * * 0', memberSyncCron: '*/15 * * * *', communityIdeaCron: '*/15 * * * *', productIdeaCron: '0 10 * * *' },
    } as any,
    sendDm: vi.fn(),
    sendGroup: vi.fn(),
    db,
    reason: vi.fn(),
  }
}

describe('Scheduler Jobs', () => {
  let db: ReturnType<typeof createDb>
  let tmpDir: string
  let ctx: JobContext

  beforeEach(() => {
    db = createDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-test-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory\nNothing yet.')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')
    ctx = createMockContext(db, tmpDir)

    db.insert(users).values({ id: 'u1', name: 'Emi', status: 'active', telegramId: 'tg_1',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }).run()
  })

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }) })

  it('reminder job has correct schedule', () => {
    const job = createReminderJob([48, 2])
    expect(job.name).toBe('event-reminders')
    expect(job.schedule).toBe('0 * * * *')
  })

  it('feedback job runs without errors', async () => {
    const job = createFeedbackJob(24)
    await expect(job.run(ctx)).resolves.not.toThrow()
  })

  it('reflection job updates memory when there is feedback', async () => {
    const event = await ctx.eventManager.create({
      title: 'Test', type: 'dinner', proposedBy: 'u1',
      date: new Date().toISOString(), maxCapacity: 10, minCapacity: 1, budget: 'low',
    })

    db.insert(feedback).values({
      id: 'f1', eventId: event.id, userId: 'u1', rating: 5,
      text: 'Great event!', collectedAt: new Date().toISOString(),
    }).run()

    const job = createReflectionJob('0 3 * * *')
    await job.run(ctx)

    expect(ctx.llm.chat).toHaveBeenCalled()
  })

  it('digest job sends group message', async () => {
    const job = createDigestJob('0 10 * * 1')
    await job.run(ctx)
    expect(ctx.sendGroup).toHaveBeenCalled()
  })

  it('reengagement job finds inactive members', async () => {
    // Make user inactive
    const twoWeeksAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    db.update(users).set({ lastActiveAt: twoWeeksAgo }).run()

    const job = createReengagementJob()
    await job.run(ctx)

    expect(ctx.sendDm).toHaveBeenCalled()
  })

  it('member sync job calls telegram sync service when configured', async () => {
    const syncKnownMembers = vi.fn().mockResolvedValue(undefined)
    ctx.telegramMemberSync = { syncKnownMembers } as any

    const job = createTelegramMemberSyncJob('*/15 * * * *')
    await job.run(ctx)

    expect(syncKnownMembers).toHaveBeenCalled()
  })

  it('product ideas job creates starter ideas from imported signals', async () => {
    db.insert(importLog).values({
      id: 'import-1',
      sourceFile: 'result.json',
      type: 'telegram',
      status: 'completed',
      error: null,
      messagesProcessed: 300,
      membersProcessed: 12,
      entriesExtracted: 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
    }).run()

    ctx.productIdeas = new ProductIdeas(db, ctx.llm, new AgentMemory(tmpDir), {
      community: { name: 'Test', type: 'local', location: 'Buenos Aires' },
    } as any)

    ;(ctx.llm.chat as any).mockResolvedValue({
      text: JSON.stringify([
        {
          title: 'Member graph',
          summary: 'Graph relationships and shared interests.',
          targetMembers: 'Admins',
          rationale: 'Imported data shows hidden clusters.',
          buildPrompt: 'Build a member graph MVP.',
        },
        {
          title: 'Topic tracker',
          summary: 'Track recurring asks.',
          targetMembers: 'Operators',
          rationale: 'Repeated asks can be productized.',
          buildPrompt: 'Build a topic tracker MVP.',
        },
        {
          title: 'Dinner co-pilot',
          summary: 'Turn dinner ideas into plans.',
          targetMembers: 'Members organizing plans',
          rationale: 'Members keep proposing dinners.',
          buildPrompt: 'Build a dinner co-pilot MVP.',
        },
      ]),
    })

    const job = createProductIdeasJob('0 10 * * *')
    await job.run(ctx)

    expect(ctx.productIdeas.listIdeas()).toHaveLength(3)
  })
})
