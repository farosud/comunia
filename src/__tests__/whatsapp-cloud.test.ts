import { describe, it, expect } from 'vitest'
import { WhatsAppCloudBridge } from '../bridges/whatsapp-cloud.js'

describe('WhatsAppCloudBridge', () => {
  it('normalizes a Cloud API webhook payload to InboundMessage', () => {
    const bridge = new WhatsAppCloudBridge({
      cloudApiToken: 'fake', phoneNumberId: '123', verifyToken: 'verify', groupId: '',
    })

    const normalized = bridge.normalizeWebhook({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '5491155551234',
              id: 'wamid.xxx',
              timestamp: '1710000000',
              text: { body: 'Hagamos un asado' },
              type: 'text',
            }],
            contacts: [{ profile: { name: 'Emi' }, wa_id: '5491155551234' }],
          },
        }],
      }],
    })

    expect(normalized).toHaveLength(1)
    expect(normalized[0].platform).toBe('whatsapp')
    expect(normalized[0].userId).toBe('wa_5491155551234')
    expect(normalized[0].userName).toBe('Emi')
    expect(normalized[0].text).toBe('Hagamos un asado')
  })

  it('handles webhook verification challenge', () => {
    const bridge = new WhatsAppCloudBridge({
      cloudApiToken: 'fake', phoneNumberId: '123', verifyToken: 'my-verify-token', groupId: '',
    })

    const result = bridge.verifyWebhook({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'my-verify-token',
      'hub.challenge': 'challenge-string',
    })

    expect(result).toBe('challenge-string')
  })

  it('rejects invalid verify token', () => {
    const bridge = new WhatsAppCloudBridge({
      cloudApiToken: 'fake', phoneNumberId: '123', verifyToken: 'my-verify-token', groupId: '',
    })

    expect(() => bridge.verifyWebhook({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'challenge-string',
    })).toThrow('Invalid verify token')
  })
})
