import { eq } from 'drizzle-orm'
import { conversations, users } from '../db/schema.js'
import type { AgentMemory } from './agent-memory.js'
import type { UserMemory } from './user-memory.js'

type Db = any

export class UserProfileMemory {
  constructor(
    private db: Db,
    private userMemory: UserMemory,
    private agentMemory: AgentMemory,
  ) {}

  async sync(userId: string): Promise<{ content: string; path: string }> {
    const resolvedUserId = await this.userMemory.resolveUserId(userId)
    const content = await this.render(resolvedUserId)
    await this.agentMemory.updateUserMemory(resolvedUserId, content)
    return {
      content,
      path: this.agentMemory.getUserMemoryPath(resolvedUserId),
    }
  }

  async getPromptContext(userId: string): Promise<string> {
    const { content } = await this.sync(userId)
    return content
  }

  private async render(userId: string): Promise<string> {
    const user = this.db.select().from(users).where(eq(users.id, userId)).get()
    const memoryEntries = await this.userMemory.getAll(userId)
    const grouped = new Map<string, typeof memoryEntries>()

    for (const entry of memoryEntries) {
      const list = grouped.get(entry.category) || []
      list.push(entry)
      grouped.set(entry.category, list)
    }

    const recentThreads = this.db.select().from(conversations).where(eq(conversations.userId, userId)).all()
      .sort((a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)

    const header = `# ${(user?.preferredName || user?.name || userId)} - Memory`
    const intro = 'Generated from structured memory plus recent conversation context. Use this to understand the member quickly.'

    const identity = [
      '## Identity',
      `- Internal ID: ${userId}`,
      user?.name ? `- Name: ${user.name}` : undefined,
      user?.preferredName ? `- Preferred name: ${user.preferredName}` : undefined,
      user?.status ? `- Status: ${user.status}` : undefined,
      user?.telegramId ? `- Telegram: ${user.telegramId}` : undefined,
      user?.whatsappId ? `- WhatsApp: ${user.whatsappId}` : undefined,
      user?.joinedAt ? `- Joined: ${user.joinedAt}` : undefined,
      user?.lastActiveAt ? `- Last active: ${user.lastActiveAt}` : undefined,
    ].filter(Boolean)

    const summary = buildSummarySection(memoryEntries)
    const structured = buildStructuredMemorySection(grouped)
    const conversationsSection = buildConversationSection(recentThreads)
    const footer = ['## File Info', `- Path: ${this.agentMemory.getUserMemoryPath(userId)}`]

    return [
      header,
      '',
      intro,
      '',
      ...identity,
      '',
      ...summary,
      '',
      ...structured,
      '',
      ...conversationsSection,
      '',
      ...footer,
      '',
    ].join('\n')
  }
}

function buildSummarySection(entries: any[]): string[] {
  if (entries.length === 0) {
    return [
      '## Snapshot',
      '- No stored user memory yet.',
    ]
  }

  const findValue = (category: string, key: string) =>
    entries.find((entry) => entry.category === category && entry.key === key)?.value

  const summaryLines = [
    findValue('preferences', 'event_format') ? `- Preferred format: ${findValue('preferences', 'event_format')}` : undefined,
    findValue('preferences', 'physical_event_style') ? `- In-person style: ${findValue('preferences', 'physical_event_style')}` : undefined,
    findValue('goals', 'community_goal') ? `- Community goal: ${findValue('goals', 'community_goal')}` : undefined,
  ].filter(Boolean) as string[]

  return [
    '## Snapshot',
    ...(summaryLines.length > 0 ? summaryLines : ['- Structured memory exists below, but no high-level snapshot fields have been captured yet.']),
  ]
}

function buildStructuredMemorySection(grouped: Map<string, any[]>): string[] {
  const lines = ['## Structured Memory']
  if (grouped.size === 0) {
    lines.push('- No structured memory stored yet.')
    return lines
  }

  for (const [category, items] of grouped) {
    lines.push(`### ${category}`)
    for (const item of items.sort((a, b) => a.key.localeCompare(b.key))) {
      lines.push(`- ${item.key}: ${item.value} (confidence: ${Number(item.confidence).toFixed(2)}, source: ${item.source})`)
    }
  }

  return lines
}

function buildConversationSection(threads: any[]): string[] {
  const lines = ['## Recent Conversations']

  if (threads.length === 0) {
    lines.push('- No recent conversation yet.')
    return lines
  }

  for (const thread of threads) {
    lines.push(`### ${thread.platform} / ${thread.chatType}`)
    lines.push(`- Last message at: ${thread.lastMessageAt}`)
    lines.push('```text')
    lines.push(thread.summary || 'No recent conversation yet.')
    lines.push('```')
  }

  return lines
}
