import { EventEmitter } from 'events'

export type ReasoningLevel = 'step' | 'detail' | 'correlation' | 'score' | 'decision' | 'research'

export interface ReasoningEvent {
  timestamp: string
  jobName: string
  level: ReasoningLevel
  message: string
  data?: Record<string, unknown>
}

export class ReasoningStream extends EventEmitter {
  private history: ReasoningEvent[] = []
  private maxHistory: number

  constructor(maxHistory = 1000) {
    super()
    this.maxHistory = maxHistory
  }

  emit_reasoning(event: Omit<ReasoningEvent, 'timestamp'>) {
    const full: ReasoningEvent = { ...event, timestamp: new Date().toISOString() }
    this.history.push(full)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory)
    }
    this.emit('reasoning', full)
    return true
  }

  getHistory(limit = 100): ReasoningEvent[] {
    return this.history.slice(-limit)
  }
}
