import { eq } from 'drizzle-orm'
import { users } from '../db/schema.js'
import { randomUUID } from 'crypto'
import type { InboundMessage } from '../bridges/types.js'
import { GroupPolicy } from '../community/group-policy.js'

type Db = any

export class MessageRouter {
  private db: Db
  private adminIds: string[]
  private groupPolicy: GroupPolicy
  private handleMessage: (msg: InboundMessage, onProgress?: (text: string) => Promise<void>) => Promise<string>
  private handleAdmin: (command: string, msg: InboundMessage) => Promise<string>

  constructor(
    db: Db,
    adminIds: string[],
    handleMessage: (msg: InboundMessage, onProgress?: (text: string) => Promise<void>) => Promise<string>,
    handleAdmin: (command: string, msg: InboundMessage) => Promise<string>,
  ) {
    this.db = db
    this.adminIds = adminIds
    this.groupPolicy = new GroupPolicy(db)
    this.handleMessage = handleMessage
    this.handleAdmin = handleAdmin
  }

  async route(msg: InboundMessage, onProgress?: (text: string) => Promise<void>): Promise<string> {
    // Auto-register or update user
    await this.ensureUser(msg)

    // Admin command detection
    if (msg.text.startsWith('/') && this.adminIds.includes(msg.userId)) {
      return this.handleAdmin(msg.text, msg)
    }

    if (msg.chatType === 'group') {
      const shouldRespond = await this.groupPolicy.shouldRespondToGroupMessage({
        userId: msg.userId,
        text: msg.text,
        replyTo: msg.replyTo,
        adminIds: this.adminIds,
      })
      if (!shouldRespond) return ''
    }

    // Route to agent
    return this.handleMessage(msg, onProgress)
  }

  private async ensureUser(msg: InboundMessage): Promise<void> {
    const platformField = msg.platform === 'telegram' ? 'telegramId' : 'whatsappId'
    const existing = this.db.select().from(users)
      .where(eq(users[platformField], msg.userId)).get()

    const now = new Date().toISOString()

    if (existing) {
      this.db.update(users)
        .set({ lastActiveAt: now, name: msg.userName })
        .where(eq(users.id, existing.id)).run()
    } else {
      this.db.insert(users).values({
        id: randomUUID(),
        [platformField]: msg.userId,
        name: msg.userName,
        status: 'active',
        joinedAt: now,
        lastActiveAt: now,
      }).run()
    }
  }
}
