import type { CronJob, JobContext } from './types.js'
import { conversations } from '../../db/schema.js'
import { gt } from 'drizzle-orm'

export function createProfileEnrichmentJob(): CronJob {
  return {
    name: 'profile-enrichment',
    schedule: '0 5 * * *', // daily at 5am
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('enrichment', 'step', 'Reviewing recent conversations for missed profile signals')

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const recentConversations = ctx.db.select().from(conversations)
        .where(gt(conversations.lastMessageAt, since)).all()

      if (recentConversations.length === 0) {
        ctx.reason('enrichment', 'detail', 'No recent conversations to review')
        return
      }

      ctx.reason('enrichment', 'detail', `Reviewing ${recentConversations.length} recent conversations`)

      for (const conv of recentConversations) {
        if (!conv.summary) continue

        const response = await ctx.llm.chat(
          `Review this conversation summary and extract any user profile information that might have been missed.

Conversation with user ${conv.userId}:
${conv.summary}

Return JSON: { "signals": [{ "category": "preferences|personality|availability|location|social", "key": "...", "value": "...", "confidence": 0.0-1.0 }] }
If no signals found, return: { "signals": [] }`,
          [{ role: 'user', content: 'Extract profile signals.' }],
        )

        try {
          const result = JSON.parse(response.text)
          for (const signal of result.signals || []) {
            await ctx.userMemory.set(conv.userId, signal.category, signal.key, signal.value, signal.confidence, 'enrichment')
            ctx.reason('enrichment', 'detail', `Enriched ${conv.userId}: ${signal.category}/${signal.key} = ${signal.value}`)
          }
        } catch {
          // Skip unparseable results
        }
      }

      ctx.reason('enrichment', 'decision', 'Profile enrichment complete')
    },
  }
}
