import type { LLMProvider } from '../agent/providers/types.js'
import type { ParseResult } from './parsers/types.js'
import type { ReasoningStream } from '../reasoning.js'

export interface AnalysisResult {
  memberProfiles: Array<{
    name: string
    summary?: string
    traits: Array<{ category: string; key: string; value: string; confidence: number }>
  }>
  communityPatterns: string[]
  suggestedMemory: string
}

const BATCH_SIZE = 500
const BATCH_HEARTBEAT_MS = 15000

export class ImportAnalyzer {
  constructor(
    private llm: LLMProvider,
    private reasoning: ReasoningStream,
  ) {}

  async analyze(parseResult: ParseResult): Promise<AnalysisResult> {
    this.reasoning.emit_reasoning({
      jobName: 'import', level: 'step',
      message: `Analyzing ${parseResult.messages.length} messages from ${parseResult.source}`,
    })

    const batches = this.chunkMessages(parseResult.messages, BATCH_SIZE)
    const allProfiles = new Map<string, Array<{ category: string; key: string; value: string; confidence: number }>>()
    const allPatterns: string[] = []

    for (let i = 0; i < batches.length; i++) {
      const batchNumber = i + 1
      const preview = summarizeBatch(batches[i])

      this.reasoning.emit_reasoning({
        jobName: 'import', level: 'detail',
        message: `Processing batch ${batchNumber}/${batches.length} (${batches[i].length} messages, ${preview.uniqueSenders} active senders)`,
      })
      this.reasoning.emit_reasoning({
        jobName: 'import', level: 'detail',
        message: `Batch ${batchNumber} preview: top senders ${preview.topSenders.join(', ')}${preview.sampleTopics.length ? `; signals: ${preview.sampleTopics.join(', ')}` : ''}`,
      })

      const startedAt = Date.now()
      const heartbeat = setInterval(() => {
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
        this.reasoning.emit_reasoning({
          jobName: 'import',
          level: 'detail',
          message: `Waiting on model for batch ${batchNumber}/${batches.length} (${elapsedSeconds}s elapsed)`,
        })
      }, BATCH_HEARTBEAT_MS)

      try {
        const response = await this.llm.chat(
          `Analyze these community chat messages. Extract:
1. Member profiles: for each person, identify preferences, interests, likes, dislikes, projects they are working on, personality traits, location signals, and social style
2. Community patterns: what types of events/activities are popular, what times, what vibe

Be concrete. If someone repeatedly mentions enjoying or wanting something, capture it. If they talk about what they are building or topics they care about, capture that too.

Messages:
${batches[i].map(m => `[${m.sender}]: ${m.text}`).join('\n')}

Return JSON:
{
  "memberProfiles": [{ "name": "...", "summary": "...", "traits": [{ "category": "preferences|personality|availability|location|social|interests|projects|food", "key": "...", "value": "...", "confidence": 0.0-1.0 }] }],
  "communityPatterns": ["pattern1", "pattern2"]
}`,
          [{ role: 'user', content: 'Analyze these messages.' }],
        )

        try {
          const result = JSON.parse(response.text)
          let newProfiles = 0
          for (const profile of result.memberProfiles || []) {
            const existing = allProfiles.get(profile.name) || []
            allProfiles.set(profile.name, [...existing, ...profile.traits])
            newProfiles += 1
          }
          allPatterns.push(...(result.communityPatterns || []))
          this.reasoning.emit_reasoning({
            jobName: 'import',
            level: 'detail',
            message: `Batch ${batchNumber}/${batches.length} complete: ${newProfiles} profiles, ${(result.communityPatterns || []).length} patterns (${Math.round(((i + 1) / batches.length) * 100)}% done)`,
          })
        } catch {
          this.reasoning.emit_reasoning({
            jobName: 'import', level: 'detail',
            message: `Batch ${batchNumber} analysis failed to parse`,
          })
        }
      } finally {
        clearInterval(heartbeat)
        this.reasoning.emit_reasoning({
          jobName: 'import',
          level: 'detail',
          message: `Batch ${batchNumber}/${batches.length} model call finished in ${Math.round((Date.now() - startedAt) / 1000)}s`,
        })
      }
    }

    // Generate memory suggestion
    const suggestedMemory = allPatterns.length > 0
      ? `# Community Memory\n\n## Patterns\n${allPatterns.map(p => `- ${p}`).join('\n')}\n\n## Member Count\n- ${allProfiles.size} members identified from import`
      : '# Community Memory\n\nNo patterns identified from import yet.'

    this.reasoning.emit_reasoning({
      jobName: 'import', level: 'decision',
      message: `Analysis complete: ${allProfiles.size} member profiles, ${allPatterns.length} patterns`,
    })

    return {
      memberProfiles: Array.from(allProfiles.entries()).map(([name, traits]) => ({ name, traits })),
      communityPatterns: allPatterns,
      suggestedMemory,
    }
  }

  private chunkMessages(messages: any[], size: number): any[][] {
    const chunks: any[][] = []
    for (let i = 0; i < messages.length; i += size) {
      chunks.push(messages.slice(i, i + size))
    }
    return chunks.length > 0 ? chunks : [[]]
  }
}

function summarizeBatch(messages: Array<{ sender: string; text: string }>) {
  const senderCounts = new Map<string, number>()
  const topicHits = new Map<string, number>()
  const topicMatchers = [
    { label: 'asados', regex: /\basad[oa]s?\b/i },
    { label: 'cenas', regex: /\bcena(s)?\b/i },
    { label: 'bbq', regex: /\bbbq\b/i },
    { label: 'meetups', regex: /\bmeetup(s)?\b/i },
    { label: 'podcasts', regex: /\bpodcast(s)?\b/i },
    { label: 'aire libre', regex: /\b(parque|aire libre|costanera|reserva)\b/i },
    { label: 'projects', regex: /\b(startup|proyecto|proyectos|build|producto|app|saas)\b/i },
    { label: 'ai', regex: /\b(ai|ia|llm|gpt|openai)\b/i },
  ]

  for (const message of messages) {
    senderCounts.set(message.sender, (senderCounts.get(message.sender) || 0) + 1)
    for (const topic of topicMatchers) {
      if (topic.regex.test(message.text)) {
        topicHits.set(topic.label, (topicHits.get(topic.label) || 0) + 1)
      }
    }
  }

  const topSenders = Array.from(senderCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sender, count]) => `${sender} (${count})`)

  const sampleTopics = Array.from(topicHits.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label)

  return {
    uniqueSenders: senderCounts.size,
    topSenders: topSenders.length ? topSenders : ['n/a'],
    sampleTopics,
  }
}
