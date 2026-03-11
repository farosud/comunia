import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSystemPrompt } from '../agent/prompts.js'
import { AgentCore } from '../agent/core.js'
import { getToolDefinitions, executeTool } from '../agent/tools.js'
import { EventManager } from '../events/manager.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { UserMemory } from '../memory/user-memory.js'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { ReasoningStream } from '../reasoning.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('buildSystemPrompt', () => {
  it('includes profiling directive', () => {
    const prompt = buildSystemPrompt({
      soul: 'soul', agent: 'agent', memory: 'memory',
      userContext: 'ctx', recentConversation: 'history', activeEvents: 'none', chatType: 'dm',
      communityType: 'local', communityLocation: 'Buenos Aires',
      currentDate: '2026-03-11T13:00:00.000Z',
    })
    expect(prompt).toContain('Profiling Directive')
    expect(prompt).toContain('update_user_memory')
    expect(prompt).toContain('Recent Conversation')
  })

  it('adjusts for distributed community', () => {
    const prompt = buildSystemPrompt({
      soul: 'soul', agent: 'agent', memory: 'memory',
      userContext: 'ctx', recentConversation: 'history', activeEvents: 'none', chatType: 'group',
      communityType: 'distributed',
      currentDate: '2026-03-11T13:00:00.000Z',
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
      id: 'u1', telegramId: 'tg_123', name: 'Emi', status: 'active',
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

  it('stores user memory when the tool receives a platform id', async () => {
    const userMemory = new UserMemory(db)
    const result = await executeTool('update_user_memory', {
      userId: 'tg_123',
      category: 'preferences',
      key: 'food',
      value: 'pizza',
      confidence: 0.8,
    }, { eventManager: eventMgr, userMemory, sendDm: vi.fn(), sendGroup: vi.fn() })

    expect(result).toContain('Memory updated')
    const entries = await userMemory.getAll('u1')
    expect(entries).toHaveLength(1)
    expect(entries[0].value).toBe('pizza')
  })
})

describe('AgentCore', () => {
  it('keeps the conversation going when a tool call fails', async () => {
    const db = createDb(':memory:')
    db.insert(users).values({
      id: 'u1', telegramId: 'tg_123', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-agent-core-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')

    const llm = {
      name: 'mock',
      chat: vi.fn()
        .mockResolvedValueOnce({
          text: '',
          toolCalls: [{
            name: 'update_user_memory',
            input: {
              userId: 'tg_missing',
              category: 'preferences',
              key: 'food',
              value: 'pizza',
            },
          }],
        })
        .mockResolvedValueOnce({
          text: 'Thanks, noted.',
          toolCalls: [],
        }),
    }

    const agent = new AgentCore({
      llm: llm as any,
      agentMemory: new AgentMemory(tmpDir),
      userMemory: new UserMemory(db),
      eventManager: new EventManager(db),
      reasoning: new ReasoningStream(),
      config: {
        community: { type: 'local', location: 'Buenos Aires' },
      } as any,
      sendDm: vi.fn(),
      sendGroup: vi.fn(),
      db,
    })

    const result = await agent.handleMessage({
      platform: 'telegram',
      chatType: 'dm',
      chatId: '123',
      userId: 'tg_123',
      userName: 'Emi',
      text: 'Necesito ayuda con una propuesta',
      timestamp: new Date().toISOString(),
    })

    expect(result).toContain('Thanks, noted.')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('includes recent conversation history on later turns', async () => {
    const db = createDb(':memory:')
    db.insert(users).values({
      id: 'u1', telegramId: 'tg_123', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-agent-history-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')

    const llm = {
      name: 'mock',
      chat: vi.fn()
        .mockResolvedValueOnce({ text: 'Contame mas.', toolCalls: [] })
        .mockResolvedValueOnce({ text: 'Lo tengo.', toolCalls: [] }),
    }

    const agent = new AgentCore({
      llm: llm as any,
      agentMemory: new AgentMemory(tmpDir),
      userMemory: new UserMemory(db),
      eventManager: new EventManager(db),
      reasoning: new ReasoningStream(),
      config: {
        community: { type: 'local', location: 'Buenos Aires' },
      } as any,
      sendDm: vi.fn(),
      sendGroup: vi.fn(),
      db,
    })

    await agent.handleMessage({
      platform: 'telegram',
      chatType: 'dm',
      chatId: '123',
      userId: 'tg_123',
      userName: 'Emi',
      text: 'Quiero hacer un asado',
      timestamp: new Date().toISOString(),
    })

    await agent.handleMessage({
      platform: 'telegram',
      chatType: 'dm',
      chatId: '123',
      userId: 'tg_123',
      userName: 'Emi',
      text: 'El proximo sabado en el cowork',
      timestamp: new Date().toISOString(),
    })

    const secondSystemPrompt = llm.chat.mock.calls[1][0]
    expect(secondSystemPrompt).toContain('# Emi - Memory')
    expect(secondSystemPrompt).toContain('## Identity')
    expect(secondSystemPrompt).toContain('User: Quiero hacer un asado')
    expect(secondSystemPrompt).toContain('Assistant: Contame mas.')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('can answer onboarding questions without going through the llm', async () => {
    const db = createDb(':memory:')
    db.insert(users).values({
      id: 'u1', telegramId: 'tg_123', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-agent-onboarding-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')

    const llm = {
      name: 'mock',
      chat: vi.fn(),
    }

    const agent = new AgentCore({
      llm: llm as any,
      agentMemory: new AgentMemory(tmpDir),
      userMemory: new UserMemory(db),
      eventManager: new EventManager(db),
      reasoning: new ReasoningStream(),
      config: {
        community: { type: 'local', location: 'Buenos Aires' },
      } as any,
      sendDm: vi.fn(),
      sendGroup: vi.fn(),
      db,
    })

    const result = await agent.handleMessage({
      platform: 'telegram',
      chatType: 'dm',
      chatId: '123',
      userId: 'tg_123',
      userName: 'Emi',
      text: 'Me gustan más los presenciales',
      timestamp: new Date().toISOString(),
    })

    expect(llm.chat).not.toHaveBeenCalled()
    expect(result).toContain('encuentros presenciales')
    expect(result).toContain('asados')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a dashboard proposal from a concrete conversational plan', async () => {
    const db = createDb(':memory:')
    db.insert(users).values({
      id: 'u1', telegramId: 'tg_123', name: 'Emi', status: 'active',
      joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    }).run()

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-agent-proposal-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')

    const eventManager = new EventManager(db)
    const llm = {
      name: 'mock',
      chat: vi.fn().mockResolvedValue({ text: 'Lo propongo.', toolCalls: [] }),
    }

    const agent = new AgentCore({
      llm: llm as any,
      agentMemory: new AgentMemory(tmpDir),
      userMemory: new UserMemory(db),
      eventManager,
      reasoning: new ReasoningStream(),
      config: {
        community: { type: 'local', location: 'Buenos Aires' },
      } as any,
      sendDm: vi.fn(),
      sendGroup: vi.fn(),
      db,
    })

    const result = await agent.handleMessage({
      platform: 'telegram',
      chatType: 'dm',
      chatId: '123',
      userId: 'tg_123',
      userName: 'Emi',
      text: 'Me pinta un asado el Sabado 14 en el Cowork de crecimiento a las 18:00 horas',
      timestamp: new Date().toISOString(),
    })

    const proposals = await eventManager.getProposals()
    expect(proposals).toHaveLength(1)
    expect(proposals[0].type).toBe('asado')
    expect(proposals[0].location).toBe('el Cowork de crecimiento')
    expect(result).toContain('sección de Propuestas')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
