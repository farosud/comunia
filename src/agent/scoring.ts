import type { LLMProvider } from './providers/types.js'
import type { EventManager } from '../events/manager.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import type { ReasoningStream } from '../reasoning.js'

export interface EventScore {
  overall: number
  breakdown: {
    historicalFit: number
    audienceMatch: number
    timing: number
    location: number
    budget: number
    novelty: number
  }
  estimatedAttendance: { min: number; max: number; likely: number }
  targetMembers: string[]
  reasoning: string
}

export class EventScoringEngine {
  constructor(
    private llm: LLMProvider,
    private eventManager: EventManager,
    private userMemory: UserMemory,
    private agentMemory: AgentMemory,
    private reasoning: ReasoningStream,
  ) {}

  async scoreEvent(eventId: string): Promise<EventScore> {
    const event = await this.eventManager.getById(eventId)
    if (!event) throw new Error('Event not found')

    this.reasoning.emit_reasoning({
      jobName: 'scoring', level: 'step',
      message: `Scoring event: "${event.title}" (${event.type})`,
    })

    const [memory, recentEvents] = await Promise.all([
      this.agentMemory.getMemory(),
      this.eventManager.getRecent(90),
    ])

    const prompt = `You are scoring a proposed community event. Analyze it against community patterns and member data.

Event: ${JSON.stringify({ title: event.title, type: event.type, date: event.date, location: event.location, budget: event.budget, maxCapacity: event.maxCapacity, minCapacity: event.minCapacity })}

Community Memory:
${memory}

Recent Events (90 days):
${recentEvents.map((e: any) => `- ${e.title} (${e.type}, ${e.status}, score: ${e.score || 'unscored'})`).join('\n') || 'None'}

Return a JSON object with:
{
  "overall": number (1-10),
  "breakdown": { "historicalFit": number, "audienceMatch": number, "timing": number, "location": number, "budget": number, "novelty": number },
  "estimatedAttendance": { "min": number, "max": number, "likely": number },
  "targetMembers": string[] (user IDs most likely to attend),
  "reasoning": string (1-2 sentences)
}

Return ONLY the JSON, no markdown.`

    const response = await this.llm.chat(prompt, [{ role: 'user', content: 'Score this event.' }])

    const score: EventScore = JSON.parse(response.text)

    this.reasoning.emit_reasoning({
      jobName: 'scoring', level: 'score',
      message: `Score: ${score.overall}/10 — ${score.reasoning}`,
      data: { breakdown: score.breakdown, attendance: score.estimatedAttendance },
    })

    await this.eventManager.setScore(eventId, score.overall, score.breakdown, score.reasoning)

    return score
  }
}
