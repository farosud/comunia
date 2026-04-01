import { randomUUID } from 'crypto'
import type { CronJob, JobContext } from './types.js'
import { research } from '../../db/schema.js'
import { ExaClient, type ExaSearchResult } from '../../integrations/exa.js'
import { CommunityProfileStore } from '../../community/profile.js'
import { TelegramEventsTopicStore } from '../../community/telegram-events-topic.js'

interface EventIdeaDecision {
  shouldPost: boolean
  title?: string
  venueName?: string
  neighborhood?: string
  planSummary?: string
  whyThisFits?: string
  sourceUrl?: string
  reason?: string
}

export function createEventFeedIdeationJob(schedule: string): CronJob {
  return {
    name: 'event-feed-ideation',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      const exa = new ExaClient(ctx.config.exa.apiKey)
      if (!exa.isConfigured()) {
        ctx.reason('event-feed-ideation', 'detail', 'Skipping event-feed ideation because EXA_API_KEY is not configured')
        return
      }

      const topicStore = new TelegramEventsTopicStore(ctx.db)
      const topic = topicStore.getState()
      if (!topic.messageThreadId) {
        ctx.reason('event-feed-ideation', 'detail', 'Skipping event-feed ideation because the Events topic is not ready yet')
        return
      }

      if (!topicStore.canPostNow()) {
        ctx.reason('event-feed-ideation', 'detail', 'Skipping event-feed ideation because the Events topic is in cooldown')
        return
      }

      const profileStore = new CommunityProfileStore(ctx.db, ctx.config)
      const profile = await profileStore.getProfile()
      if (!profile.city) {
        ctx.reason('event-feed-ideation', 'detail', 'Skipping event-feed ideation because no city is configured in the community profile')
        return
      }

      const query = buildIdeationQuery(profile)
      const agentFiles = await ctx.agentMemory.getAll().catch(() => ({ soul: '', memory: '', agent: '' }))
      ctx.reason('event-feed-ideation', 'step', `Searching Exa for venue ideas in ${profile.city}`)

      const results = await exa.search({
        query,
        numResults: 8,
      })

      if (results.length === 0) {
        ctx.reason('event-feed-ideation', 'detail', 'Exa returned no venue candidates for ideation')
        return
      }

      const response = await ctx.llm.chat(
        [
          'You invent realistic local plans for a community and post them in an Events Telegram topic.',
          'Use the venue/location search results as grounding.',
          'Use the soul and agent instructions as the main definition of the community taste and operating style.',
          'Propose one plan only.',
          'Keep it grounded in a real location from the results.',
          'Return JSON only with this shape:',
          '{"shouldPost":boolean,"title":"string","venueName":"string","neighborhood":"string","planSummary":"string","whyThisFits":"string","sourceUrl":"string","reason":"string"}',
        ].join('\n'),
        [{
          role: 'user',
          content: [
            `Community soul:\n${agentFiles.soul}`,
            `Agent instructions:\n${agentFiles.agent}`,
            `Community context:\n${await profileStore.buildPromptContext()}`,
            agentFiles.memory ? `Existing community memory:\n${agentFiles.memory}` : '',
            `Venue query: ${query}`,
            `Search results:\n${JSON.stringify(minimizeResults(results), null, 2)}`,
          ].filter(Boolean).join('\n\n'),
        }],
      )

      const decision = parseJson<EventIdeaDecision>(response.text)
      if (!decision?.shouldPost || !decision.sourceUrl || !decision.title) {
        ctx.reason(
          'event-feed-ideation',
          'detail',
          decision?.reason || 'No grounded community plan was selected from the Exa venue results',
        )
        return
      }

      const fingerprint = normalizeFingerprint(`${decision.sourceUrl}|${decision.title}`)
      if (hasPostedFingerprint(ctx, fingerprint)) {
        ctx.reason('event-feed-ideation', 'detail', `Skipping duplicate plan idea ${decision.title}`)
        return
      }

      await ctx.sendGroup(formatIdeaMessage(decision), { messageThreadId: topic.messageThreadId })
      topicStore.markPosted()
      persistPostedFingerprint(ctx, {
        fingerprint,
        module: 'event-feed-ideation',
        sourceUrl: decision.sourceUrl,
        title: decision.title,
      })

      ctx.reason('event-feed-ideation', 'decision', `Posted event idea: ${decision.title}`, {
        sourceUrl: decision.sourceUrl,
      })
    },
  }
}

function buildIdeationQuery(profile: {
  city: string
  description: string
  interests: string
  ideationNotes: string
}): string {
  const parts = [
    `restaurants, parks, bars, cultural spaces, and walkable meeting spots in ${profile.city}`,
    profile.interests ? `for people interested in ${profile.interests}` : '',
    profile.description ? `community vibe: ${profile.description}` : '',
    profile.ideationNotes ? profile.ideationNotes : '',
    'prefer places that can host small to medium social gatherings',
  ]
  return parts.filter(Boolean).join(', ')
}

function minimizeResults(results: ExaSearchResult[]) {
  return results.map((result) => ({
    title: result.title,
    url: result.url,
    publishedDate: result.publishedDate,
    highlights: result.highlights || [],
    text: truncate(result.text || '', 600),
    summary: result.summary,
  }))
}

function formatIdeaMessage(decision: EventIdeaDecision): string {
  return [
    'New plan idea',
    '',
    decision.title || '',
    decision.venueName
      ? `Spot: ${decision.venueName}${decision.neighborhood ? ` (${decision.neighborhood})` : ''}`
      : '',
    decision.planSummary ? `Plan: ${decision.planSummary}` : '',
    decision.whyThisFits ? `Why this could work: ${decision.whyThisFits}` : '',
    decision.sourceUrl ? `Source: ${decision.sourceUrl}` : '',
  ].filter(Boolean).join('\n')
}

function parseJson<T>(text: string): T | undefined {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function normalizeFingerprint(value: string): string {
  return value.trim().toLowerCase()
}

function hasPostedFingerprint(ctx: JobContext, fingerprint: string): boolean {
  const rows = ctx.db.select().from(research).all()
  return rows.some((row: any) => {
    if (row.category !== 'telegram_events_topic_post') return false
    try {
      const data = JSON.parse(row.data || '{}')
      return data.fingerprint === fingerprint
    } catch {
      return false
    }
  })
}

function persistPostedFingerprint(ctx: JobContext, input: {
  fingerprint: string
  module: string
  sourceUrl: string
  title: string
}) {
  ctx.db.insert(research).values({
    id: randomUUID(),
    category: 'telegram_events_topic_post',
    eventType: input.module,
    data: JSON.stringify(input),
    source: 'exa-search',
    researchedAt: new Date().toISOString(),
  }).run()
}
