import type { CronJob, JobContext } from './types.js'
import { eq, and, lt } from 'drizzle-orm'
import { events, rsvps, feedback } from '../../db/schema.js'

export function createFeedbackJob(delayHours: number): CronJob {
  return {
    name: 'feedback-collection',
    schedule: '0 * * * *', // hourly check
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('feedback', 'step', 'Checking for events needing feedback collection')

      const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString()
      const completed = ctx.db.select().from(events)
        .where(and(eq(events.status, 'completed'), lt(events.date, cutoff))).all()

      for (const event of completed) {
        const attendees = ctx.db.select().from(rsvps)
          .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'yes'))).all()

        for (const attendee of attendees) {
          const existing = ctx.db.select().from(feedback)
            .where(and(eq(feedback.eventId, event.id), eq(feedback.userId, attendee.userId))).get()

          if (!existing) {
            ctx.reason('feedback', 'detail', `Requesting feedback from ${attendee.userId} for "${event.title}"`)
            await ctx.sendDm(attendee.userId,
              `Hey! How was "${event.title}"? Rate it 1-5 and share any thoughts. Your feedback helps us plan better events!`)
          }
        }
      }
    },
  }
}
