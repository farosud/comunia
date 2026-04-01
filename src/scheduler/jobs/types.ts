import type { LLMProvider } from '../../agent/providers/types.js'
import type { EventManager } from '../../events/manager.js'
import type { UserMemory } from '../../memory/user-memory.js'
import type { AgentMemory } from '../../memory/agent-memory.js'
import type { ReasoningStream } from '../../reasoning.js'
import type { Config } from '../../config.js'
import type { TelegramMemberSync } from '../../members/telegram-sync.js'
import type { ProductIdeas } from '../../community/product-ideas.js'

export interface JobContext {
  llm: LLMProvider
  eventManager: EventManager
  userMemory: UserMemory
  agentMemory: AgentMemory
  reasoning: ReasoningStream
  config: Config
  sendDm: (userId: string, message: string) => Promise<void>
  sendGroup: (message: string, options?: { messageThreadId?: number }) => Promise<void>
  db: any
  telegramMemberSync?: TelegramMemberSync
  productIdeas?: ProductIdeas
  reason: (jobName: string, level: string, message: string, data?: Record<string, unknown>) => void
}

export interface CronJob {
  name: string
  schedule: string
  enabled: boolean
  run: (ctx: JobContext) => Promise<void>
}
