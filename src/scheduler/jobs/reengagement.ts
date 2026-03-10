import type { CronJob, JobContext } from './types.js'
import { users } from '../../db/schema.js'
import { lt } from 'drizzle-orm'

export function createReengagementJob(): CronJob {
  return {
    name: 'reengagement',
    schedule: '0 11 * * *', // daily at 11am
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('reengagement', 'step', 'Checking for inactive members')

      const inactiveSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const inactive = ctx.db.select().from(users)
        .where(lt(users.lastActiveAt, inactiveSince)).all()
        .filter((u: any) => u.status === 'active')

      ctx.reason('reengagement', 'detail', `Found ${inactive.length} inactive members`)

      for (const user of inactive.slice(0, 5)) { // max 5 per day
        const response = await ctx.llm.chat(
          `Write a brief, friendly re-engagement message for a community member who has been inactive for 2+ weeks. Be warm, not pushy. Mention upcoming events if relevant. Keep it under 50 words.`,
          [{ role: 'user', content: `Member name: ${user.name || 'friend'}` }],
        )

        const userId = user.telegramId || user.whatsappId
        if (userId) {
          await ctx.sendDm(userId, response.text)
          ctx.reason('reengagement', 'detail', `Sent re-engagement to ${user.name}`)
        }
      }
    },
  }
}
