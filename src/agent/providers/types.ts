export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LLMMessage { role: 'user' | 'assistant'; content: string }

export interface ToolCall { name: string; input: Record<string, unknown> }

export interface LLMResponse { text: string; toolCalls: ToolCall[] }

export interface LLMProvider {
  name: string
  chat(system: string, messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>
}

export interface LLMConfig {
  provider: string
  anthropicApiKey?: string
  openaiApiKey?: string
  openrouterApiKey?: string
  openrouterModel?: string
  ollamaUrl?: string
}

// Static imports — ESM-safe, no require()
import { ClaudeProvider } from './claude.js'
import { OpenAIProvider } from './openai.js'
import { OpenRouterProvider } from './openrouter.js'

export function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'claude': {
      if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY required for claude provider')
      return new ClaudeProvider(config.anthropicApiKey)
    }
    case 'openai': {
      if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY required for openai provider')
      return new OpenAIProvider(config.openaiApiKey)
    }
    case 'openrouter': {
      if (!config.openrouterApiKey) throw new Error('OPENROUTER_API_KEY required for openrouter provider')
      return new OpenRouterProvider(config.openrouterApiKey, config.openrouterModel)
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}
