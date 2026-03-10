import type { CronJob, JobContext } from './types.js'
import { research } from '../../db/schema.js'
import { randomUUID } from 'crypto'

export function createVenueResearchJob(schedule: string): CronJob {
  return {
    name: 'venue-research',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      if (ctx.config.community.type === 'distributed') {
        ctx.reason('venue-research', 'step', 'Skipping venue research — distributed community')
        return
      }

      ctx.reason('venue-research', 'step', 'Starting venue research for local community')

      const memory = await ctx.agentMemory.getMemory()
      const recentEvents = await ctx.eventManager.getRecent(60)

      const response = await ctx.llm.chat(
        `You are a community venue researcher for a local community${ctx.config.community.location ? ` in ${ctx.config.community.location}` : ''}.

Community patterns:
${memory}

Recent events:
${recentEvents.map((e: any) => `- ${e.title} (${e.type}, ${e.location || 'no location'})`).join('\n') || 'None'}

Research 3-5 venue ideas that would work for this community. For each venue, provide:
- name: venue name
- type: restaurant/bar/park/coworking/event-space
- description: 1-2 sentences why it fits
- capacity: estimated
- priceRange: low/medium/high
- bestFor: what event types it suits

Return as JSON array.`,
        [{ role: 'user', content: 'Find venue ideas.' }],
      )

      try {
        const venues = JSON.parse(response.text)
        for (const venue of venues) {
          ctx.reason('venue-research', 'research', `Found venue: ${venue.name} (${venue.type})`)
          ctx.db.insert(research).values({
            id: randomUUID(),
            category: 'venue',
            data: JSON.stringify(venue),
            source: 'llm-research',
            researchedAt: new Date().toISOString(),
          }).run()
        }
        ctx.reason('venue-research', 'decision', `Stored ${venues.length} venue ideas`)
      } catch {
        ctx.reason('venue-research', 'step', 'Failed to parse venue research results')
      }
    },
  }
}
