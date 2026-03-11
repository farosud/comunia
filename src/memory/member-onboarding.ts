import type { InboundMessage } from '../bridges/types.js'
import type { UserMemory } from './user-memory.js'

type OnboardingStage = 'event_format' | 'physical_style' | 'community_goal' | 'complete'

interface OnboardingState {
  stage: OnboardingStage
}

export interface OnboardingResult {
  directReply?: string
  followUpQuestion?: string
}

export class MemberOnboarding {
  constructor(private userMemory: UserMemory) {}

  async handleMessage(userId: string, msg: InboundMessage): Promise<OnboardingResult> {
    if (msg.chatType !== 'dm') return {}

    const state = await this.getState(userId)
    const text = msg.text.trim()

    if (state.stage === 'event_format') {
      const format = parseEventFormat(text)
      if (format) {
        await this.userMemory.set(userId, 'preferences', 'event_format', format, 0.95, 'onboarding')
        if (format === 'physical') {
          await this.setStage(userId, 'physical_style')
          return {
            directReply: 'Perfecto, entonces sé que tiendes a disfrutar más los encuentros presenciales.',
            followUpQuestion: questionFor('physical_style'),
          }
        }

        await this.setStage(userId, 'community_goal')
        return {
          directReply: 'Buenísimo, entonces voy a pensar también en formatos digitales para ti.',
          followUpQuestion: questionFor('community_goal'),
        }
      }

      if (looksLikeGreeting(text)) {
        await this.setStage(userId, 'event_format')
        return { directReply: questionFor('event_format') }
      }

      return { followUpQuestion: questionFor('event_format') }
    }

    if (state.stage === 'physical_style') {
      const style = parsePhysicalStyle(text)
      if (style) {
        await this.userMemory.set(userId, 'preferences', 'physical_event_style', style, 0.9, 'onboarding')
        await this.setStage(userId, 'community_goal')
        return {
          directReply: 'Me sirve mucho saber ese tipo de plan presencial que te energiza.',
          followUpQuestion: questionFor('community_goal'),
        }
      }

      return { followUpQuestion: questionFor('physical_style') }
    }

    if (state.stage === 'community_goal') {
      if (looksMeaningful(text)) {
        await this.userMemory.set(userId, 'goals', 'community_goal', text, 0.95, 'onboarding')
        await this.setStage(userId, 'complete')
        return {
          directReply: 'Excelente. Con eso ya tengo una mejor idea de cómo conectar oportunidades y recomendaciones que de verdad te sirvan.',
        }
      }

      return { followUpQuestion: questionFor('community_goal') }
    }

    return {}
  }

  async getPendingQuestion(userId: string): Promise<string | undefined> {
    const state = await this.getState(userId)
    if (state.stage === 'complete') return undefined
    return questionFor(state.stage)
  }

  private async getState(userId: string): Promise<OnboardingState> {
    const entries = await this.userMemory.getByCategory(userId, 'onboarding').catch(() => [])
    const stage = entries.find((entry: { key: string; value: string }) => entry.key === 'stage')?.value as OnboardingStage | undefined
    return { stage: stage || 'event_format' }
  }

  private async setStage(userId: string, stage: OnboardingStage): Promise<void> {
    await this.userMemory.set(userId, 'onboarding', 'stage', stage, 1, 'onboarding')
  }
}

function questionFor(stage: OnboardingStage): string {
  switch (stage) {
    case 'event_format':
      return 'Quiero conocerte un poco mejor para recomendarte cosas que de verdad te entusiasmen: ¿te atraen más los encuentros digitales o los presenciales?'
    case 'physical_style':
      return 'Y si hablamos de planes presenciales, ¿qué te prende más: fiestas grandes, asados, salidas al aire libre, o cenas más íntimas?'
    case 'community_goal':
      return 'Última para ubicar bien tu mapa: ¿qué te gustaría encontrar en esta comunidad o con qué tipo de personas / temas te gustaría conectar?'
    default:
      return ''
  }
}

function parseEventFormat(text: string): 'digital' | 'physical' | undefined {
  const normalized = text.toLowerCase()
  if (/\b(digital|digitales|virtual|virtuales|online|remoto|remotos)\b/.test(normalized)) return 'digital'
  if (/\b(f[ií]sico|fisico|presencial|presenciales|en persona|cara a cara)\b/.test(normalized)) return 'physical'
  return undefined
}

function parsePhysicalStyle(text: string): string | undefined {
  const normalized = text.toLowerCase()
  if (/\b(fiesta|fiestas|party|parties)\b/.test(normalized)) return 'large parties'
  if (/\b(asado|bbq|barbacoa)\b/.test(normalized)) return 'bbqs'
  if (/\b(aire libre|outdoor|caminata|parque|salida)\b/.test(normalized)) return 'outdoor outings'
  if (/\b(cena|dinner|intima|íntima|small dinner|charla chica)\b/.test(normalized)) return 'intimate dinners'
  return undefined
}

function looksLikeGreeting(text: string): boolean {
  const normalized = text.toLowerCase()
  return /^(hola+|buenas|hey|hi|hello|que tal|qué tal|como va|cómo va)[!. ]*$/.test(normalized)
}

function looksMeaningful(text: string): boolean {
  return text.trim().split(/\s+/).length >= 4
}
