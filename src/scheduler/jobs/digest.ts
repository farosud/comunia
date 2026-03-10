import type { CronJob, JobContext } from './types.js'
import { events, users } from '../../db/schema.js'
import { gt } from 'drizzle-orm'

export function createDigestJob(schedule: string): CronJob {
  return {
    name: 'weekly-digest',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('digest', 'step', 'Generating weekly community digest')

      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const weekEvents = ctx.db.select().from(events).where(gt(events.createdAt, since)).all()
      const activeMembers = ctx.db.select().from(users).where(gt(users.lastActiveAt, since)).all()

      const response = await ctx.llm.chat(
        `Write a brief, friendly weekly community digest. Include stats and highlights. Keep it under 200 words.`,
        [{ role: 'user', content: JSON.stringify({ events: weekEvents.length, activeMembers: activeMembers.length, weekEvents }) }],
      )

      await ctx.sendGroup(response.text)
      ctx.reason('digest', 'decision', 'Weekly digest sent to group')
    },
  }
}
