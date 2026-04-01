import { randomUUID } from 'crypto'
import type { CronJob, JobContext } from './types.js'
import { research } from '../../db/schema.js'
import { ExaClient, type ExaSearchResult } from '../../integrations/exa.js'
import { CommunityProfileStore } from '../../community/profile.js'
import { TelegramEventsTopicStore } from '../../community/telegram-events-topic.js'

interface EventDiscoveryDecision {
  shouldPost: boolean
  title?: string
  venue?: string
  timing?: string
  whyThisFits?: string
  sourceUrl?: string
  sourceTitle?: string
  reason?: string
}

export function createCityEventDiscoveryJob(schedule: string): CronJob {
  return {
    name: 'city-event-discovery',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      const exa = new ExaClient(ctx.config.exa.apiKey)
      if (!exa.isConfigured()) {
        ctx.reason('city-event-discovery', 'detail', 'Skipping city event discovery because EXA_API_KEY is not configured')
        return
      }

      const topicStore = new TelegramEventsTopicStore(ctx.db)
      const topic = topicStore.getState()
      if (!topic.messageThreadId) {
        ctx.reason('city-event-discovery', 'detail', 'Skipping city event discovery because the Events topic is not ready yet')
        return
      }

      if (!topicStore.canPostNow()) {
        ctx.reason('city-event-discovery', 'detail', 'Skipping city event discovery because the Events topic is in cooldown')
        return
      }

      const profileStore = new CommunityProfileStore(ctx.db, ctx.config)
      const profile = await profileStore.getProfile()
      if (!profile.city) {
        ctx.reason('city-event-discovery', 'detail', 'Skipping city event discovery because no city is configured in the community profile')
        return
      }

      const query = buildEventDiscoveryQuery(profile)
      const agentFiles = await ctx.agentMemory.getAll().catch(() => ({ soul: '', memory: '', agent: '' }))
      ctx.reason('city-event-discovery', 'step', `Searching Exa for relevant events in ${profile.city}`)

      const results = await exa.search({
        query,
        numResults: 8,
        startPublishedDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      })

      if (results.length === 0) {
        ctx.reason('city-event-discovery', 'detail', 'Exa returned no event candidates for the current search')
        return
      }

      const response = await ctx.llm.chat(
        [
          'You curate a Telegram topic called Events for a local community.',
          'Choose the single best real-world event from the search results.',
          'Only pick events that look concrete and upcoming.',
          'Reject generic guides, vague listings, venue homepages, and past events.',
          'Use the soul and agent instructions as the main definition of what this community is and what should appeal to it.',
          'Return JSON only with this shape:',
          '{"shouldPost":boolean,"title":"string","venue":"string","timing":"string","whyThisFits":"string","sourceUrl":"string","sourceTitle":"string","reason":"string"}',
        ].join('\n'),
        [{
          role: 'user',
          content: [
            `Community soul:\n${agentFiles.soul}`,
            `Agent instructions:\n${agentFiles.agent}`,
            agentFiles.memory ? `Community memory:\n${agentFiles.memory}` : '',
            `Community context:\n${await profileStore.buildPromptContext()}`,
            `Search query: ${query}`,
            `Search results:\n${JSON.stringify(minimizeResults(results), null, 2)}`,
          ].filter(Boolean).join('\n\n'),
        }],
      )

      const decision = parseJson<EventDiscoveryDecision>(response.text)
      if (!decision?.shouldPost || !decision.sourceUrl || !decision.title) {
        ctx.reason(
          'city-event-discovery',
          'detail',
          decision?.reason || 'No suitable local event was selected from the Exa results',
        )
        return
      }

      const fingerprint = normalizeFingerprint(decision.sourceUrl)
      if (hasPostedFingerprint(ctx, fingerprint)) {
        ctx.reason('city-event-discovery', 'detail', `Skipping duplicate event source ${decision.sourceUrl}`)
        return
      }

      await ctx.sendGroup(formatDiscoveryMessage(decision), { messageThreadId: topic.messageThreadId })
      topicStore.markPosted()
      persistPostedFingerprint(ctx, {
        fingerprint,
        module: 'city-event-discovery',
        sourceUrl: decision.sourceUrl,
        title: decision.title,
      })

      ctx.reason('city-event-discovery', 'decision', `Posted event discovery: ${decision.title}`, {
        sourceUrl: decision.sourceUrl,
      })
    },
  }
}

function buildEventDiscoveryQuery(profile: {
  city: string
  description: string
  interests: string
  eventSearchCriteria: string
}): string {
  const parts = [
    `upcoming events in ${profile.city}`,
    profile.interests ? `for people into ${profile.interests}` : '',
    profile.description ? `community vibe: ${profile.description}` : '',
    profile.eventSearchCriteria ? profile.eventSearchCriteria : '',
    'prefer pages with date, place, and enough detail to decide whether it is worth attending',
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

function formatDiscoveryMessage(decision: EventDiscoveryDecision): string {
  return [
    'New event find',
    '',
    decision.title || '',
    decision.timing ? `When: ${decision.timing}` : '',
    decision.venue ? `Where: ${decision.venue}` : '',
    decision.whyThisFits ? `Why this fits: ${decision.whyThisFits}` : '',
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
