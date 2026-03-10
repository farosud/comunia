import type { CronJob, JobContext } from './types.js'
import { events, users } from '../../db/schema.js'
import { gt } from 'drizzle-orm'

export function createEventIdeationJob(schedule: string): CronJob {
  return {
    name: 'event-ideation',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('ideation', 'step', 'Starting weekly event ideation')

      const memory = await ctx.agentMemory.getMemory()
      const recentEvents = await ctx.eventManager.getRecent(30)
      const activeMembers = ctx.db.select().from(users)
        .where(gt(users.lastActiveAt, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())).all()

      ctx.reason('ideation', 'detail', `Analyzing ${activeMembers.length} active members and ${recentEvents.length} recent events`)

      const response = await ctx.llm.chat(
        `You are a community event planner. Propose 2-3 event ideas for the upcoming week.

Community: ${ctx.config.community.name} (${ctx.config.community.type}${ctx.config.community.location ? `, ${ctx.config.community.location}` : ''})

Community learnings:
${memory}

Recent events:
${recentEvents.map((e: any) => `- ${e.title} (${e.type}, ${e.status}, score: ${e.score || 'unscored'})`).join('\n') || 'None'}

Active members: ${activeMembers.length}

Propose events as JSON array:
[{ "title": "...", "type": "...", "date": "ISO string", "location": "...", "reasoning": "..." }]

Consider: gaps in recent events, member preferences, timing patterns, variety.`,
        [{ role: 'user', content: 'Propose event ideas for this week.' }],
      )

      try {
        const ideas = JSON.parse(response.text)
        for (const idea of ideas) {
          ctx.reason('ideation', 'decision', `Proposing: "${idea.title}" — ${idea.reasoning}`)
          await ctx.eventManager.create({
            title: idea.title,
            type: idea.type,
            proposedBy: 'agent',
            date: idea.date,
            location: idea.location,
            budget: idea.budget || 'medium',
          })
        }
        ctx.reason('ideation', 'decision', `Created ${ideas.length} draft events for admin review`)
      } catch {
        ctx.reason('ideation', 'step', 'Failed to parse event ideas')
      }
    },
  }
}
