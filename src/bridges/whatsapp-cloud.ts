import type { Bridge, InboundMessage, OutboundMessage } from './types.js'

interface WhatsAppCloudConfig {
  cloudApiToken: string
  phoneNumberId: string
  verifyToken: string
  groupId: string
}

const GRAPH_API = 'https://graph.facebook.com/v21.0'

export class WhatsAppCloudBridge implements Bridge {
  platform = 'whatsapp' as const
  private config: WhatsAppCloudConfig
  private handler?: (msg: InboundMessage) => Promise<void>

  constructor(config: WhatsAppCloudConfig) {
    this.config = config
  }

  // Called by Hono webhook route: GET /webhook/whatsapp
  verifyWebhook(query: Record<string, string>): string {
    if (query['hub.verify_token'] !== this.config.verifyToken) {
      throw new Error('Invalid verify token')
    }
    return query['hub.challenge']
  }

  // Called by Hono webhook route: POST /webhook/whatsapp
  normalizeWebhook(body: any): InboundMessage[] {
    const messages: InboundMessage[] = []

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value
        if (!value.messages) continue

        const contactMap = new Map<string, string>()
        for (const contact of value.contacts || []) {
          contactMap.set(contact.wa_id, contact.profile.name)
        }

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue

          messages.push({
            platform: 'whatsapp',
            chatType: 'dm', // Cloud API delivers as 1:1; group detection via metadata
            chatId: msg.from,
            userId: `wa_${msg.from}`,
            userName: contactMap.get(msg.from) || 'Unknown',
            text: msg.text.body,
            timestamp: new Date(Number(msg.timestamp) * 1000).toISOString(),
          })
        }
      }
    }

    return messages
  }

  // Webhook-based — "start" registers the webhook routes (done in dashboard server)
  async start(): Promise<void> {
    console.log('WhatsApp Cloud API bridge started (webhook mode)')
    console.log('  Webhook URL: POST /webhook/whatsapp')
    console.log('  Note: requires public HTTPS URL or tunnel (e.g. ngrok) for Meta to reach')
  }

  async stop(): Promise<void> {}

  async sendMessage(msg: OutboundMessage): Promise<void> {
    const response = await fetch(
      `${GRAPH_API}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.cloudApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msg.chatId.replace('wa_', ''),
          type: 'text',
          text: { body: msg.text },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status} ${await response.text()}`)
    }
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler
  }

  // Called by webhook POST handler
  async handleIncoming(body: any): Promise<void> {
    if (!this.handler) return
    const messages = this.normalizeWebhook(body)
    for (const msg of messages) {
      await this.handler(msg)
    }
  }
}
