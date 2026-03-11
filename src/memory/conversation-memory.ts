import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { conversations } from '../db/schema.js'

type Db = any

interface AppendTurnInput {
  userId: string
  platform: 'telegram' | 'whatsapp'
  chatType: 'group' | 'dm'
  role: 'user' | 'assistant'
  content: string
}

export class ConversationMemory {
  constructor(private db: Db) {}

  async getRecentTranscript(
    userId: string,
    platform: 'telegram' | 'whatsapp',
    chatType: 'group' | 'dm',
  ): Promise<string> {
    const conversation = this.getConversation(userId, platform, chatType)
    return conversation?.summary || 'No recent conversation yet.'
  }

  async appendTurn(input: AppendTurnInput): Promise<void> {
    const existing = this.getConversation(input.userId, input.platform, input.chatType)
    const line = `${input.role === 'user' ? 'User' : 'Assistant'}: ${normalizeLine(input.content)}`
    const transcript = existing?.summary
      ? existing.summary.split('\n').filter(Boolean)
      : []

    transcript.push(line)
    const summary = transcript.slice(-12).join('\n')
    const now = new Date().toISOString()

    if (existing) {
      this.db.update(conversations)
        .set({ summary, lastMessageAt: now })
        .where(eq(conversations.id, existing.id)).run()
      return
    }

    this.db.insert(conversations).values({
      id: randomUUID(),
      userId: input.userId,
      platform: input.platform,
      chatType: input.chatType,
      summary,
      lastMessageAt: now,
    }).run()
  }

  private getConversation(
    userId: string,
    platform: 'telegram' | 'whatsapp',
    chatType: 'group' | 'dm',
  ) {
    return this.db.select().from(conversations)
      .where(and(
        eq(conversations.userId, userId),
        eq(conversations.platform, platform),
        eq(conversations.chatType, chatType),
      ))
      .get()
  }
}

function normalizeLine(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}
