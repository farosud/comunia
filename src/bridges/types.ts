import { z } from 'zod'

export const inboundMessageSchema = z.object({
  platform: z.enum(['telegram', 'whatsapp']),
  chatType: z.enum(['group', 'dm']),
  chatId: z.string(),
  userId: z.string(),
  userName: z.string(),
  text: z.string(),
  replyTo: z.string().optional(),
  timestamp: z.string().datetime(),
})

export type InboundMessage = z.infer<typeof inboundMessageSchema>

export function parseInboundMessage(data: unknown): InboundMessage {
  return inboundMessageSchema.parse(data)
}

export interface OutboundMessage {
  platform: 'telegram' | 'whatsapp'
  chatId: string
  text: string
  replyTo?: string
  messageThreadId?: number
}

export interface Bridge {
  platform: 'telegram' | 'whatsapp'
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(msg: OutboundMessage): Promise<void>
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void
}
