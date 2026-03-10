import type { LLMProvider, LLMMessage } from './providers/types.js'
import { buildSystemPrompt } from './prompts.js'
import { getToolDefinitions, executeTool } from './tools.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { UserMemory } from '../memory/user-memory.js'
import { EventManager } from '../events/manager.js'
import { ReasoningStream } from '../reasoning.js'
import type { InboundMessage } from '../bridges/types.js'
import type { Config } from '../config.js'

interface AgentDeps {
  llm: LLMProvider
  agentMemory: AgentMemory
  userMemory: UserMemory
  eventManager: EventManager
  reasoning: ReasoningStream
  config: Config
  sendDm: (userId: string, message: string) => Promise<void>
  sendGroup: (message: string) => Promise<void>
  db: any
}

export class AgentCore {
  private deps: AgentDeps

  constructor(deps: AgentDeps) { this.deps = deps }

  async handleMessage(msg: InboundMessage): Promise<string> {
    const { llm, agentMemory, userMemory, eventManager, config } = this.deps

    const [agentFiles, userContext, activeEvents] = await Promise.all([
      agentMemory.getAll(),
      userMemory.formatForPrompt(msg.userId),
      eventManager.getUpcoming(),
    ])

    const system = buildSystemPrompt({
      soul: agentFiles.soul,
      agent: agentFiles.agent,
      memory: agentFiles.memory,
      userContext,
      activeEvents: activeEvents.length
        ? activeEvents.map((e: any) => `- ${e.title}: ${e.date} at ${e.location} (${e.status})`).join('\n')
        : 'No upcoming events.',
      chatType: msg.chatType,
      communityType: config.community.type,
      communityLocation: config.community.location,
    })

    const tools = getToolDefinitions()
    const messages: LLMMessage[] = [{ role: 'user', content: msg.text }]

    let response = await llm.chat(system, messages, tools)
    let maxIterations = 5

    while (response.toolCalls.length > 0 && maxIterations > 0) {
      for (const tc of response.toolCalls) {
        this.deps.reasoning.emit_reasoning({
          jobName: 'conversation', level: 'detail',
          message: `Tool call: ${tc.name}(${JSON.stringify(tc.input)})`,
        })

        const result = await executeTool(tc.name, tc.input, {
          eventManager, userMemory,
          sendDm: this.deps.sendDm, sendGroup: this.deps.sendGroup,
        })
        messages.push({ role: 'assistant', content: `[Tool: ${tc.name}] ${result}` })
      }
      messages.push({ role: 'user', content: 'Continue based on the tool results above.' })
      response = await llm.chat(system, messages, tools)
      maxIterations--
    }

    return response.text
  }

  async handleAdminQuestion(question: string): Promise<string> {
    const [agentFiles, recentEvents] = await Promise.all([
      this.deps.agentMemory.getAll(),
      this.deps.eventManager.getRecent(30),
    ])

    const response = await this.deps.llm.chat(
      `You are a community management AI. An admin is asking about your reasoning. Answer with specific data points, member counts, percentages, and quotes from feedback. Be precise.

Community knowledge:
${agentFiles.memory}

Recent events (30 days):
${recentEvents.map((e: any) => `- ${e.title} (${e.type}, ${e.status})`).join('\n')}`,
      [{ role: 'user', content: question }],
    )

    return response.text
  }
}
