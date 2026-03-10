import { describe, it, expect } from 'vitest'
import { parseInboundMessage } from '../bridges/types.js'

describe('bridge types', () => {
  it('validates a well-formed inbound message', () => {
    const msg = parseInboundMessage({
      platform: 'telegram', chatType: 'group', chatId: 'chat123',
      userId: 'user456', userName: 'Emi', text: 'Hagamos un asado',
      timestamp: new Date().toISOString(),
    })
    expect(msg.platform).toBe('telegram')
    expect(msg.chatType).toBe('group')
  })

  it('rejects invalid platform', () => {
    expect(() => parseInboundMessage({
      platform: 'discord', chatType: 'group', chatId: 'c1',
      userId: 'u1', userName: 'Test', text: 'hello',
      timestamp: new Date().toISOString(),
    })).toThrow()
  })

  it('allows optional replyTo field', () => {
    const msg = parseInboundMessage({
      platform: 'whatsapp', chatType: 'dm', chatId: 'c1',
      userId: 'u1', userName: 'Test', text: 'hello', replyTo: 'msg789',
      timestamp: new Date().toISOString(),
    })
    expect(msg.replyTo).toBe('msg789')
  })
})
