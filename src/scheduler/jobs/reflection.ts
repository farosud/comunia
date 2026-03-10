import type { CronJob, JobContext } from './types.js'
import { feedback, events } from '../../db/schema.js'
import { gt } from 'drizzle-orm'

export function createReflectionJob(schedule: string): CronJob {
  return {
    name: 'agent-reflection',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('reflection', 'step', 'Starting daily self-reflection')

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const recentFeedback = ctx.db.select().from(feedback)
        .where(gt(feedback.collectedAt, since)).all()
      const recentEvents = ctx.db.select().from(events)
        .where(gt(events.createdAt, since)).all()

      if (recentFeedback.length === 0 && recentEvents.length === 0) {
        ctx.reason('reflection', 'detail', 'No new data to reflect on')
        return
      }

      ctx.reason('reflection', 'detail', `Reflecting on ${recentFeedback.length} feedback entries and ${recentEvents.length} events`)

      const currentMemory = await ctx.agentMemory.getMemory()

      const response = await ctx.llm.chat(
        `You are a community management AI reflecting on recent activity. Update your memory with new learnings.

Current memory:
${currentMemory}

Recent feedback:
${recentFeedback.map((f: any) => `- Event: rating=${f.rating}, comment="${f.text}"`).join('\n') || 'None'}

Recent events:
${recentEvents.map((e: any) => `- ${e.title} (${e.type}, ${e.status}, score: ${e.score || 'unscored'})`).join('\n') || 'None'}

Return the COMPLETE updated memory.md content. Preserve existing learnings, add new ones, and update confidence levels.`,
        [{ role: 'user', content: 'Update your memory based on recent activity.' }],
      )

      await ctx.agentMemory.updateMemory(response.text)
      ctx.reason('reflection', 'decision', 'Memory updated with new learnings')
    },
  }
}
