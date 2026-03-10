import type { LLMProvider } from '../agent/providers/types.js'
import type { ParseResult } from './parsers/types.js'
import type { ReasoningStream } from '../reasoning.js'

export interface AnalysisResult {
  memberProfiles: Array<{
    name: string
    traits: Array<{ category: string; key: string; value: string; confidence: number }>
  }>
  communityPatterns: string[]
  suggestedMemory: string
}

const BATCH_SIZE = 500

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
      this.reasoning.emit_reasoning({
        jobName: 'import', level: 'detail',
        message: `Processing batch ${i + 1}/${batches.length} (${batches[i].length} messages)`,
      })

      const response = await this.llm.chat(
        `Analyze these community chat messages. Extract:
1. Member profiles: for each person, identify preferences, personality traits, location signals, interests
2. Community patterns: what types of events/activities are popular, what times, what vibe

Messages:
${batches[i].map(m => `[${m.sender}]: ${m.text}`).join('\n')}

Return JSON:
{
  "memberProfiles": [{ "name": "...", "traits": [{ "category": "preferences|personality|availability|location|social", "key": "...", "value": "...", "confidence": 0.0-1.0 }] }],
  "communityPatterns": ["pattern1", "pattern2"]
}`,
        [{ role: 'user', content: 'Analyze these messages.' }],
      )

      try {
        const result = JSON.parse(response.text)
        for (const profile of result.memberProfiles || []) {
          const existing = allProfiles.get(profile.name) || []
          allProfiles.set(profile.name, [...existing, ...profile.traits])
        }
        allPatterns.push(...(result.communityPatterns || []))
      } catch {
        this.reasoning.emit_reasoning({
          jobName: 'import', level: 'detail',
          message: `Batch ${i + 1} analysis failed to parse`,
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
