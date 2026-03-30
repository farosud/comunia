import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createDb } from '../db/index.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { ProductIdeas } from '../community/product-ideas.js'
import { importLog, users } from '../db/schema.js'

describe('ProductIdeas', () => {
  let db: ReturnType<typeof createDb>
  let tmpDir: string

  beforeEach(() => {
    db = createDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-product-ideas-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul\nBuilders, operators, and side projects.')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory\nThe community likes practical tools.')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')

    db.insert(users).values({
      id: 'u1',
      name: 'Emi',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }).run()
  })

  it('seeds three starter product ideas once import context exists', async () => {
    db.insert(importLog).values({
      id: 'import-1',
      sourceFile: 'result.json',
      type: 'telegram',
      status: 'completed',
      error: null,
      messagesProcessed: 4023,
      membersProcessed: 14,
      entriesExtracted: 31,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
    }).run()

    const llm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify([
          {
            title: 'Founder intro matcher',
            summary: 'Matches people for high-signal intros.',
            targetMembers: 'Founders looking for peers',
            rationale: 'Imported chats show repeated matching needs.',
            buildPrompt: 'Build a founder intro matcher MVP.',
          },
          {
            title: 'Resource pulse board',
            summary: 'Surfaces recurring asks and useful links.',
            targetMembers: 'Members asking for tactical help',
            rationale: 'Repeated asks can be productized.',
            buildPrompt: 'Build a resource pulse board MVP.',
          },
          {
            title: 'Dinner planner',
            summary: 'Turns loose dinner ideas into concrete plans.',
            targetMembers: 'Members who want to organize faster',
            rationale: 'The community keeps suggesting dinners.',
            buildPrompt: 'Build a dinner planner MVP.',
          },
        ]),
      }),
    } as any

    const service = new ProductIdeas(db, llm, new AgentMemory(tmpDir), {
      community: { name: 'Sideprojects', type: 'local', location: 'Buenos Aires' },
    } as any)

    const state = await service.getDashboardState()
    expect(state.hasImportedContext).toBe(true)
    expect(state.ideas).toHaveLength(3)
    expect(state.ideas[0].buildPrompt.length).toBeGreaterThan(10)
  })

  it('stays empty without imported context', async () => {
    const llm = { chat: vi.fn() } as any
    const service = new ProductIdeas(db, llm, new AgentMemory(tmpDir), {
      community: { name: 'Sideprojects', type: 'local', location: 'Buenos Aires' },
    } as any)

    const state = await service.getDashboardState()
    expect(state.hasImportedContext).toBe(false)
    expect(state.ideas).toHaveLength(0)
    expect(llm.chat).not.toHaveBeenCalled()
  })

  it('analyzes external community signals without writing dashboard ideas', async () => {
    const llm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify([
          {
            title: 'Episode rewatch planner',
            summary: 'Turns favorite-episode chatter into coordinated rewatch plans.',
            targetMembers: 'Fans who want structured watch parties',
            rationale: 'Threads cluster around memorable episodes and character arcs.',
            buildPrompt: 'Build a rewatch planner MVP.',
          },
        ]),
      }),
    } as any

    const service = new ProductIdeas(db, llm, new AgentMemory(tmpDir), {
      community: { name: 'Sideprojects', type: 'local', location: 'Buenos Aires' },
    } as any)

    const result = await service.analyzeExternalSignals({
      community: { name: 'r/TheGoodPlace', type: 'distributed', location: 'Reddit' },
      signalSummary: 'Top posts discuss favorite episodes, ethics quizzes, and character rankings.',
      count: 1,
    })

    expect(result.community.name).toBe('r/TheGoodPlace')
    expect(result.ideas).toHaveLength(1)
    expect(result.ideas[0].title).toBe('Episode rewatch planner')
    expect(service.listIdeas()).toHaveLength(0)
  })

  it('falls back to deterministic ideas when the model call hangs', async () => {
    vi.useFakeTimers()
    const llm = {
      chat: vi.fn(() => new Promise(() => {})),
    } as any

    const service = new ProductIdeas(db, llm, new AgentMemory(tmpDir), {
      community: { name: 'Sideprojects', type: 'local', location: 'Buenos Aires' },
    } as any)

    const pending = service.analyzeExternalSignals({
      community: { name: 'r/TheGoodPlace', type: 'distributed', location: 'Reddit' },
      signalSummary: 'Top posts discuss ethics games and favorite episodes.',
      count: 2,
    })

    await vi.advanceTimersByTimeAsync(8100)
    const result = await pending

    expect(result.ideas).toHaveLength(2)
    expect(result.ideas[0].title.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })
})
