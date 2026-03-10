import type { LLMProvider } from '../agent/providers/types.js'
import type { EventManager } from './manager.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { ReasoningStream } from '../reasoning.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

type Db = any

const MATCH_THRESHOLD = 0.6

interface TargetMatch {
  userId: string
  score: number
  reason: string
}

export class SmartTargeting {
  constructor(
    private llm: LLMProvider,
    private eventManager: EventManager,
    private userMemory: UserMemory,
    private reasoning: ReasoningStream,
    private sendDm: (userId: string, message: string) => Promise<void>,
    private db: Db,
  ) {}

  async targetForEvent(eventId: string): Promise<{ targeted: number; skipped: number }> {
    const event = await this.eventManager.getById(eventId)
    if (!event) throw new Error('Event not found')

    this.reasoning.emit_reasoning({
      jobName: 'targeting', level: 'step',
      message: `Smart targeting for "${event.title}"`,
    })

    const allUsers = this.db.select().from(users).where(eq(users.status, 'active')).all()

    // Get profile summaries for all users
    const profiles: string[] = []
    for (const user of allUsers) {
      const profile = await this.userMemory.formatForPrompt(user.id)
      profiles.push(`${user.id} (${user.name}): ${profile}`)
    }

    const response = await this.llm.chat(
      `You are matching community members to an event. Score each member's fit (0-1) and explain why.

Event: ${JSON.stringify({ title: event.title, type: event.type, date: event.date, location: event.location, budget: event.budget })}

Members:
${profiles.join('\n')}

Return JSON: { "matches": [{ "userId": "...", "score": 0.0-1.0, "reason": "..." }] }`,
      [{ role: 'user', content: 'Score member fits for this event.' }],
    )

    let matches: TargetMatch[] = []
    try {
      const result = JSON.parse(response.text)
      matches = result.matches || []
    } catch {
      this.reasoning.emit_reasoning({
        jobName: 'targeting', level: 'step',
        message: 'Failed to parse targeting results',
      })
      return { targeted: 0, skipped: 0 }
    }

    let targeted = 0
    let skipped = 0

    for (const match of matches) {
      if (match.score >= MATCH_THRESHOLD) {
        // Find the user's platform ID for DM
        const user = allUsers.find((u: any) => u.id === match.userId)
        const dmId = user?.telegramId || user?.whatsappId
        if (dmId) {
          await this.sendDm(dmId, `Hey ${user.name}! "${event.title}" is coming up on ${new Date(event.date).toLocaleDateString()}${event.location ? ` at ${event.location}` : ''}. ${match.reason}`)
          targeted++
          this.reasoning.emit_reasoning({
            jobName: 'targeting', level: 'detail',
            message: `Targeted ${user.name} (score: ${match.score}) — ${match.reason}`,
          })
        }
      } else {
        skipped++
      }
    }

    this.reasoning.emit_reasoning({
      jobName: 'targeting', level: 'decision',
      message: `Targeting complete: ${targeted} DMs sent, ${skipped} members skipped`,
    })

    return { targeted, skipped }
  }
}
