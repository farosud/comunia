import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db/index.js'
import { users } from '../db/schema.js'
import { UserMemory } from '../memory/user-memory.js'
import { MemberOnboarding } from '../memory/member-onboarding.js'

describe('MemberOnboarding', () => {
  let db: ReturnType<typeof createDb>
  let onboarding: MemberOnboarding

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
    onboarding = new MemberOnboarding(new UserMemory(db))
  })

  it('starts with a conversational first question on greetings', async () => {
    const result = await onboarding.handleMessage('u1', {
      platform: 'telegram',
      chatType: 'dm',
      chatId: '123',
      userId: 'tg_123',
      userName: 'Emi',
      text: 'Hola',
      timestamp: new Date().toISOString(),
    })

    expect(result.directReply).toContain('digitales o los presenciales')
  })

  it('captures physical preferences and asks the next question', async () => {
    const result = await onboarding.handleMessage('u1', {
      platform: 'telegram',
      chatType: 'dm',
      chatId: '123',
      userId: 'tg_123',
      userName: 'Emi',
      text: 'Me gustan más los presenciales',
      timestamp: new Date().toISOString(),
    })

    expect(result.directReply).toContain('encuentros presenciales')
    expect(result.followUpQuestion).toContain('asados')
  })
})
