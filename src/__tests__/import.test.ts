import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ImportAnalyzer } from '../import/analyzer.js'
import { ImportSeeder } from '../import/seeder.js'
import { createDb } from '../db/index.js'
import { users, importLog } from '../db/schema.js'
import { UserMemory } from '../memory/user-memory.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { ReasoningStream } from '../reasoning.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('ImportAnalyzer', () => {
  const mockLlm = {
    name: 'mock',
    chat: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        memberProfiles: [
          {
            name: 'Emi',
            summary: 'Likes asados and likes organizing social plans.',
            traits: [{ category: 'preferences', key: 'food', value: 'asado', confidence: 0.9 }],
          },
          {
            name: 'Ana',
            summary: 'Based near Palermo and interested in local meetups.',
            traits: [{ category: 'location', key: 'neighborhood', value: 'Palermo', confidence: 0.8 }],
          },
        ],
        communityPatterns: ['Weekend events are popular', 'Members prefer outdoor activities'],
      }),
      toolCalls: [],
    }),
  }

  beforeEach(() => {
    mockLlm.chat.mockClear()
  })

  it('analyzes parsed messages and extracts profiles', async () => {
    const reasoning = new ReasoningStream()
    const analyzer = new ImportAnalyzer(mockLlm as any, reasoning)

    const result = await analyzer.analyze({
      messages: [
        { sender: 'Emi', text: 'Hagamos un asado', timestamp: new Date() },
        { sender: 'Ana', text: 'Dale, en Palermo', timestamp: new Date() },
      ],
      members: [{ name: 'Emi' }, { name: 'Ana' }],
      source: 'chat.txt',
      format: 'whatsapp-export',
    })

    expect(result.memberProfiles).toHaveLength(2)
    expect(result.communityPatterns).toHaveLength(2)
    expect(result.suggestedMemory).toContain('Patterns')
  })

  it('batches large message sets', async () => {
    const reasoning = new ReasoningStream()
    const analyzer = new ImportAnalyzer(mockLlm as any, reasoning)

    const messages = Array.from({ length: 1200 }, (_, i) => ({
      sender: `User${i % 5}`, text: `Message ${i}`, timestamp: new Date(),
    }))

    await analyzer.analyze({
      messages,
      members: [],
      source: 'big-chat.txt',
      format: 'whatsapp-export',
    })

    // Should have been called 3 times (1200 / 500 = 3 batches)
    expect(mockLlm.chat).toHaveBeenCalledTimes(3)
  })
})

describe('ImportSeeder', () => {
  let db: ReturnType<typeof createDb>
  let tmpDir: string
  let seeder: ImportSeeder

  beforeEach(() => {
    db = createDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-test-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory\nNothing yet.')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent')

    seeder = new ImportSeeder(db, new UserMemory(db), new AgentMemory(tmpDir))
  })

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }) })

  it('creates users and stores memories', async () => {
    const result = await seeder.seed({
      messages: [{ sender: 'Emi', text: 'Hagamos un asado', timestamp: new Date(), platform: 'telegram' }],
      members: [{
        name: 'Emi',
        platform: 'telegram',
        platformId: 'user123',
        messageCount: 1,
        firstMessageAt: new Date('2026-03-11T18:00:00.000Z'),
        lastMessageAt: new Date('2026-03-11T18:00:00.000Z'),
      }],
      source: 'chat.txt',
      format: 'telegram-export',
    }, {
      memberProfiles: [
        {
          name: 'Emi',
          summary: 'Likes asado plans.',
          traits: [{ category: 'preferences', key: 'food', value: 'asado', confidence: 0.9 }],
        },
      ],
      communityPatterns: ['Weekend events popular'],
      suggestedMemory: '# Community Memory\n\n## Patterns\n- Weekend events popular',
    }, 'chat.txt')

    expect(result.usersCreated).toBe(1)
    expect(result.memoriesStored).toBe(5)

    const allUsers = db.select().from(users).all()
    expect(allUsers).toHaveLength(1)
    expect(allUsers[0].name).toBe('Emi')
    expect(allUsers[0].telegramId).toBe('tg_123')

    const userMemoryPath = path.join(tmpDir, 'users', allUsers[0].id, 'memory.md')
    expect(fs.existsSync(userMemoryPath)).toBe(true)
    expect(fs.readFileSync(userMemoryPath, 'utf-8')).toContain('food: asado')
  })

  it('ingests members before deeper enrichment', async () => {
    const result = await seeder.ingestMembers({
      messages: [{ sender: 'Emi', text: 'Hola', timestamp: new Date(), platform: 'telegram' }],
      members: [{
        name: 'Emi',
        platform: 'telegram',
        platformId: 'user123',
        messageCount: 12,
        firstMessageAt: new Date('2026-03-11T18:00:00.000Z'),
        lastMessageAt: new Date('2026-03-11T19:00:00.000Z'),
      }],
      source: 'chat.txt',
      format: 'telegram-export',
    })

    expect(result.usersCreated).toBe(1)
    expect(result.memoriesStored).toBe(3)

    const allUsers = db.select().from(users).all()
    expect(allUsers).toHaveLength(1)
    expect(allUsers[0].telegramId).toBe('tg_123')

    const userMemoryPath = path.join(tmpDir, 'users', allUsers[0].id, 'memory.md')
    expect(fs.existsSync(userMemoryPath)).toBe(true)
    expect(fs.readFileSync(userMemoryPath, 'utf-8')).toContain('import_message_count: 12')
  })

  it('updates agent memory for first import', async () => {
    await seeder.seed({
      messages: [],
      members: [],
      source: 'test.txt',
      format: 'plaintext',
    }, {
      memberProfiles: [],
      communityPatterns: ['Test pattern'],
      suggestedMemory: '# New Memory Content',
    }, 'test.txt')

    const memory = fs.readFileSync(path.join(tmpDir, 'memory.md'), 'utf-8')
    expect(memory).toBe('# New Memory Content')
  })

  it('does not create import log rows directly', async () => {
    await seeder.seed({
      messages: [],
      members: [],
      source: 'test.txt',
      format: 'plaintext',
    }, {
      memberProfiles: [],
      communityPatterns: ['Test pattern'],
      suggestedMemory: '# New Memory Content',
    }, 'test.txt')

    const logs = db.select().from(importLog).all()
    expect(logs).toHaveLength(0)
  })
})
