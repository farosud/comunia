import type { CronJob, JobContext } from './types.js'
import { gt, and, eq } from 'drizzle-orm'
import { events, rsvps } from '../../db/schema.js'

export function createReminderJob(hoursBefore: number[]): CronJob {
  return {
    name: 'event-reminders',
    schedule: '0 * * * *', // hourly check
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('reminders', 'step', 'Checking for upcoming events needing reminders')

      const now = new Date()
      for (const hours of hoursBefore) {
        const targetTime = new Date(now.getTime() + hours * 60 * 60 * 1000)
        const windowStart = new Date(targetTime.getTime() - 30 * 60 * 1000)
        const windowEnd = new Date(targetTime.getTime() + 30 * 60 * 1000)

        const upcoming = ctx.db.select().from(events)
          .where(and(
            gt(events.date, windowStart.toISOString()),
            eq(events.status, 'confirmed'),
          )).all()
          .filter((e: any) => e.date <= windowEnd.toISOString())

        for (const event of upcoming) {
          ctx.reason('reminders', 'detail', `Sending ${hours}h reminder for "${event.title}"`)
          const attendees = ctx.db.select().from(rsvps)
            .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, 'yes'))).all()

          for (const attendee of attendees) {
            await ctx.sendDm(attendee.userId,
              `Reminder: "${event.title}" is in ${hours} hours! ${event.location ? `Location: ${event.location}` : ''}`)
          }
        }
      }
    },
  }
}
