import type { LLMProvider, LLMMessage } from './providers/types.js'
import { buildSystemPrompt } from './prompts.js'
import { buildEventProgressMessage, extractEventSignals } from './event-signals.js'
import { createOrUpdateProposalFromSignals } from './proposal-tracker.js'
import { getToolDefinitions, executeTool } from './tools.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { UserMemory } from '../memory/user-memory.js'
import { ConversationMemory } from '../memory/conversation-memory.js'
import { MemberOnboarding } from '../memory/member-onboarding.js'
import { UserProfileMemory } from '../memory/user-profile-memory.js'
import { EventManager } from '../events/manager.js'
import { ReasoningStream } from '../reasoning.js'
import type { InboundMessage } from '../bridges/types.js'
import type { Config } from '../config.js'
import type { GroupPolicy } from '../community/group-policy.js'

interface AgentDeps {
  llm: LLMProvider
  agentMemory: AgentMemory
  userMemory: UserMemory
  eventManager: EventManager
  reasoning: ReasoningStream
  config: Config
  sendDm: (userId: string, message: string) => Promise<void>
  sendGroup: (message: string) => Promise<void>
  createGroupTopic?: (name: string) => Promise<{ messageThreadId: number; name: string }>
  groupPolicy?: GroupPolicy
  db: any
}

export class AgentCore {
  private deps: AgentDeps

  constructor(deps: AgentDeps) { this.deps = deps }

  async handleMessage(msg: InboundMessage, onProgress?: (text: string) => Promise<void>): Promise<string> {
    const { llm, agentMemory, userMemory, eventManager, config } = this.deps
    const startedAt = Date.now()
    const conversationMemory = new ConversationMemory(this.deps.db)
    const onboarding = new MemberOnboarding(userMemory)
    const userProfileMemory = new UserProfileMemory(this.deps.db, userMemory, agentMemory)
    const internalUserId = await userMemory.resolveUserId(msg.userId)
    const trace = createTrace(this.deps.reasoning, 'conversation', startedAt)
    trace('User resolved')

    await onProgress?.('Entendiendo lo que quieres lograr...')

    const [agentFiles, activeEvents, recentConversation, onboardingResult] = await Promise.all([
      agentMemory.getAll(),
      eventManager.getUpcoming(),
      conversationMemory.getRecentTranscript(internalUserId, msg.platform, msg.chatType),
      onboarding.handleMessage(internalUserId, msg),
    ])
    trace('Loaded agent files, events, transcript, and onboarding state')

    const userContext = await userProfileMemory.getPromptContext(internalUserId)
    trace('Built prompt context from user profile memory')

    await onProgress?.('Revisando lo que ya compartimos en la conversación...')

    const eventSignals = extractEventSignals(`${recentConversation}\n${msg.text}`)
    const eventProgress = buildEventProgressMessage(eventSignals)
    if (eventProgress) {
      await onProgress?.(eventProgress)
    }

    const proposalResult = await createOrUpdateProposalFromSignals(
      eventManager,
      internalUserId,
      msg.text,
      eventSignals,
    )
    trace('Extracted event signals and updated proposal state')
    if (proposalResult) {
      await onProgress?.(
        proposalResult.created
          ? 'Ya guardé esta idea en Propuestas para que el admin la vea.'
          : `Actualicé la propuesta existente con ${proposalResult.changedFields.join(', ') || 'nuevos detalles'}.`,
      )
    }

    if (onboardingResult.directReply && shouldBypassAgentForOnboarding(msg)) {
      const directReply = appendFollowUp(onboardingResult.directReply, onboardingResult.followUpQuestion)
      await conversationMemory.appendTurn({
        userId: internalUserId,
        platform: msg.platform,
        chatType: msg.chatType,
        role: 'user',
        content: msg.text,
      })
      await conversationMemory.appendTurn({
        userId: internalUserId,
        platform: msg.platform,
        chatType: msg.chatType,
        role: 'assistant',
        content: directReply,
      })
      trace('Answered via onboarding fast path')
      void syncUserProfileInBackground(userProfileMemory, internalUserId, this.deps.reasoning)
      return directReply
    }

    const system = buildSystemPrompt({
      soul: agentFiles.soul,
      agent: agentFiles.agent,
      memory: agentFiles.memory,
      userContext,
      recentConversation,
      activeEvents: activeEvents.length
        ? activeEvents.map((e: any) => `- ${e.title}: ${e.date} at ${e.location} (${e.status})`).join('\n')
        : 'No upcoming events.',
      chatType: msg.chatType,
      communityType: config.community.type,
      communityLocation: config.community.location,
      currentDate: new Date().toISOString(),
    })

    await conversationMemory.appendTurn({
      userId: internalUserId,
      platform: msg.platform,
      chatType: msg.chatType,
      role: 'user',
      content: msg.text,
    })
    trace('Stored user turn in conversation memory')

    const tools = getToolDefinitions()
    const messages: LLMMessage[] = [{ role: 'user', content: msg.text }]

    await onProgress?.('Pensando en la mejor siguiente acción...')

    trace('Calling model for initial response')
    let response = await llm.chat(system, messages, tools)
    trace(`Initial model response received with ${response.toolCalls.length} tool calls`)
    let maxIterations = 5

    while (response.toolCalls.length > 0 && maxIterations > 0) {
      for (const tc of response.toolCalls) {
        await onProgress?.(progressMessageForTool(tc.name))
        this.deps.reasoning.emit_reasoning({
          jobName: 'conversation', level: 'detail',
          message: `Tool call: ${tc.name}(${JSON.stringify(tc.input)})`,
        })

        let result: string
        try {
          const toolStartedAt = Date.now()
          result = await executeTool(tc.name, tc.input, {
            eventManager, userMemory,
            sendDm: this.deps.sendDm, sendGroup: this.deps.sendGroup,
            createGroupTopic: this.deps.createGroupTopic,
            groupPolicy: this.deps.groupPolicy,
          })
          trace(`Tool ${tc.name} completed in ${Date.now() - toolStartedAt}ms`)
        } catch (error) {
          result = `Tool error: ${String(error)}`
          this.deps.reasoning.emit_reasoning({
            jobName: 'conversation',
            level: 'detail',
            message: `Tool ${tc.name} failed`,
            data: { error: String(error) },
          })
        }
        messages.push({ role: 'assistant', content: `[Tool: ${tc.name}] ${result}` })
      }
      messages.push({ role: 'user', content: 'Continue based on the tool results above.' })
      await onProgress?.('Cerrando la mejor respuesta para ti...')
      trace('Calling model after tool execution')
      response = await llm.chat(system, messages, tools)
      trace(`Follow-up model response received with ${response.toolCalls.length} tool calls`)
      maxIterations--
    }

    const finalReply = appendFollowUp(
      maybeAppendProposalNote(response.text, proposalResult),
      onboardingResult.followUpQuestion,
    )

    await conversationMemory.appendTurn({
      userId: internalUserId,
      platform: msg.platform,
      chatType: msg.chatType,
      role: 'assistant',
      content: finalReply,
    })
    trace('Stored assistant reply in conversation memory')

    void syncUserProfileInBackground(userProfileMemory, internalUserId, this.deps.reasoning)
    trace('Returning final reply')

    return finalReply
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

function createTrace(reasoning: ReasoningStream, jobName: string, startedAt: number) {
  return (message: string) => {
    reasoning.emit_reasoning({
      jobName,
      level: 'detail',
      message: `${message} (+${Date.now() - startedAt}ms)`,
    })
  }
}

function syncUserProfileInBackground(
  userProfileMemory: UserProfileMemory,
  userId: string,
  reasoning: ReasoningStream,
) {
  return userProfileMemory.sync(userId).catch((error) => {
    reasoning.emit_reasoning({
      jobName: 'conversation',
      level: 'detail',
      message: `Deferred user profile sync failed: ${String(error)}`,
    })
  })
}

function progressMessageForTool(toolName: string): string {
  switch (toolName) {
    case 'propose_event_idea':
    case 'create_event':
      return 'Armando un borrador del evento...'
    case 'update_user_memory':
      return 'Guardando lo importante que aprendí de ti...'
    case 'find_matching_members':
      return 'Buscando conexiones relevantes entre miembros...'
    case 'score_event':
      return 'Evaluando qué tan bien encaja la propuesta...'
    case 'send_dm':
      return 'Preparando un mensaje personalizado...'
    case 'create_group_topic':
      return 'Creando un topic nuevo en Telegram...'
    default:
      return 'Ordenando la mejor siguiente acción...'
  }
}

function shouldBypassAgentForOnboarding(msg: InboundMessage): boolean {
  if (msg.chatType !== 'dm') return false
  const normalized = msg.text.trim().toLowerCase()
  return !looksLikeEventPlanningIntent(normalized)
}

function looksLikeEventPlanningIntent(normalized: string): boolean {
  if (/\b(asado|evento|invitar|invit[aeo]r|comunidad|sábado|sabado|domingo|viernes|cowork|lugar|ubicaci[oó]n|hora|personas|capacidad|reserva|bar|restaurante|restaurant|pm|am|admin|propuesta)\b/.test(normalized)) {
    return true
  }

  return /\b(\d{1,2}:\d{2}|\d+\s*(pm|am)|14 de marzo|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(normalized)
}

function appendFollowUp(response: string, followUpQuestion?: string): string {
  if (!followUpQuestion) return response
  if (response.includes(followUpQuestion)) return response
  return `${response}\n\n${followUpQuestion}`
}

function maybeAppendProposalNote(
  response: string,
  proposalResult?: { created: boolean; changedFields: string[] },
): string {
  if (!proposalResult) return response

  const note = proposalResult.created
    ? 'Ya dejé esta idea visible en la sección de Propuestas del dashboard para que el admin y la comunidad la sigan completando.'
    : `Ya actualicé la Propuesta en el dashboard con ${proposalResult.changedFields.join(', ') || 'nuevos detalles'}.`

  if (response.includes('sección de Propuestas') || response.includes('Propuesta en el dashboard')) {
    return response
  }

  return `${response}\n\n${note}`
}
