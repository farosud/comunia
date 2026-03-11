import type { CronJob, JobContext } from './types.js'
import { PublicPortal } from '../../community/public-portal.js'
import { users, userMemory } from '../../db/schema.js'
import { eq, gt } from 'drizzle-orm'

export function createCommunityIdeasJob(schedule: string): CronJob {
  return {
    name: 'community-ideas',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('community-ideas', 'step', 'Generating public idea stream for the community portal')

      const portal = new PublicPortal(ctx.db, ctx.config)
      const recentIdeas = await portal.getRecentIdeas(14)
      const recentEvents = await ctx.eventManager.getRecent(45)
      const openIdeas = await portal.getIdeas()
      const activeMembers = ctx.db.select().from(users)
        .where(eq(users.status, 'active')).all()

      const memoryRows = ctx.db.select().from(userMemory).all()
      const profileSummary = activeMembers.map((member: any) => {
        const entries = memoryRows.filter((row: any) => row.userId === member.id)
        return `${member.name}: ${entries.map((entry: any) => `${entry.key}=${entry.value}`).join(', ') || 'no profile data'}`
      }).join('\n')

      const soul = await ctx.agentMemory.getSoul().catch(() => '')
      const memory = await ctx.agentMemory.getMemory().catch(() => '')

      const targetCount = recentIdeas.length === 0 ? 5 : 1
      if (recentIdeas.length > 0 && openIdeas.length >= 12) {
        ctx.reason('community-ideas', 'detail', 'Skipping idea generation because the public stream already has enough open ideas')
        return
      }

      let ideas = fallbackIdeas(ctx, targetCount)

      try {
        const response = await ctx.llm.chat(
          `You are creating public-facing idea cards for a community portal.

Community:
- Name: ${ctx.config.community.name}
- Type: ${ctx.config.community.type}
- Location: ${ctx.config.community.location || 'not specified'}

Recent events:
${recentEvents.map((event: any) => `- ${event.title} (${event.type}, ${event.status})`).join('\n') || 'None'}

Recent public ideas:
${recentIdeas.map((idea: any) => `- ${idea.title} (${idea.format})`).join('\n') || 'None'}

Member signals:
${profileSummary || 'No member signals yet'}

Soul:
${truncate(soul, 3000) || 'No soul content yet'}

Memory:
${truncate(memory, 3000) || 'No community memory yet'}

Return a JSON array with exactly ${targetCount} ideas:
[
  {
    "title": "...",
    "description": "...",
    "format": "dinner|bbq|podcast|topic-chat|meetup-call|outdoor|salon",
    "rationale": "..."
  }
]

Make them feel like lightweight possibilities, not fixed plans. Keep them specific and varied.`,
          [{ role: 'user', content: `Generate ${targetCount} fresh community ideas for the public portal.` }],
        )

        const parsed = JSON.parse(response.text)
        if (Array.isArray(parsed) && parsed.length > 0) {
          ideas = parsed
        }
      } catch {
        ctx.reason('community-ideas', 'detail', 'Falling back to deterministic idea generation')
      }

      let created = 0
      for (const idea of ideas.slice(0, targetCount)) {
        const normalizedTitle = String(idea.title || '').trim().toLowerCase()
        if (!normalizedTitle) continue
        const duplicate = recentIdeas.find((existing: any) => existing.title.trim().toLowerCase() === normalizedTitle)
        if (duplicate) continue

        await portal.createIdea({
          title: String(idea.title).trim(),
          description: String(idea.description || 'A lightweight idea for the community to react to.').trim(),
          format: String(idea.format || 'meetup-call').trim(),
          rationale: String(idea.rationale || '').trim(),
          source: 'agent',
        })
        created++
      }

      ctx.reason('community-ideas', 'decision', `Created ${created} new public idea cards`)
    },
  }
}

function fallbackIdeas(ctx: JobContext, count = 5) {
  const local = ctx.config.community.type !== 'distributed'
  const location = ctx.config.community.location ? ` around ${ctx.config.community.location}` : ''

  return [
    {
      title: local ? `Small dinner${location}` : 'Operator dinner over video',
      description: local
        ? `A low-pressure dinner for 6-8 people to talk about what everyone is building and where the community should go next.`
        : 'A conversational video dinner where a small group brings food and talks through current projects.',
      format: 'dinner',
      rationale: 'Smaller formats make it easier for members with overlapping interests to connect quickly.',
    },
    {
      title: local ? `Community BBQ${location}` : 'Casual meetup call',
      description: local
        ? 'A barbecue or asado style hangout with enough room for new members and stronger social mixing.'
        : 'An open call for members who want a lighter touchpoint without committing to a full event.',
      format: local ? 'bbq' : 'meetup-call',
      rationale: 'A relaxed social format helps surface new friendships and side-topic conversations.',
    },
    {
      title: 'Topic deep-dive session',
      description: 'A focused conversation around one topic the community keeps circling back to, with room for spontaneous discussion.',
      format: 'topic-chat',
      rationale: 'Recurring themes in the community are usually good signals for high-energy gatherings.',
    },
    {
      title: local ? `Podcast dinner${location}` : 'Podcast reflection circle',
      description: 'Members bring one clip, podcast, or essay and use it to spark a real discussion.',
      format: 'podcast',
      rationale: 'Shared references make conversations deeper faster.',
    },
    {
      title: local ? `Outdoor walk + coffee${location}` : '1:1 coffee roulette',
      description: local
        ? 'A lower-pressure format for members who connect better while moving than in louder gatherings.'
        : 'A lightweight matching format for members who want a softer first interaction.',
      format: local ? 'outdoor' : 'meetup-call',
      rationale: 'Low-friction plans help quieter members opt in.',
    },
  ].slice(0, count)
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...` : value
}
