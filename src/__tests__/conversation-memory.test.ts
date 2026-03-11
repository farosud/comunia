import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { ConversationMemory } from '../memory/conversation-memory.js'

describe('ConversationMemory', () => {
  let db: ReturnType<typeof createDb>
  let memory: ConversationMemory

  beforeEach(() => {
    db = createDb(':memory:')
    db.insert(users).values({
      id: 'u1',
      telegramId: 'tg_123',
      name: 'Emi',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }).run()
    memory = new ConversationMemory(db)
  })

  it('stores a rolling transcript per user and channel', async () => {
    await memory.appendTurn({
      userId: 'u1',
      platform: 'telegram',
      chatType: 'dm',
      role: 'user',
      content: 'Quiero hacer un asado',
    })
    await memory.appendTurn({
      userId: 'u1',
      platform: 'telegram',
      chatType: 'dm',
      role: 'assistant',
      content: 'Que fecha tienes en mente?',
    })

    const transcript = await memory.getRecentTranscript('u1', 'telegram', 'dm')
    expect(transcript).toContain('User: Quiero hacer un asado')
    expect(transcript).toContain('Assistant: Que fecha tienes en mente?')
  })
})
