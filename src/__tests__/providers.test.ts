import { describe, it, expect } from 'vitest'
import { createProvider } from '../agent/providers/types.js'

describe('LLM Provider', () => {
  it('returns claude provider', () => {
    const provider = createProvider({ provider: 'claude', anthropicApiKey: 'sk-ant-test' })
    expect(provider.name).toBe('claude')
  })

  it('returns openai provider', () => {
    const provider = createProvider({ provider: 'openai', openaiApiKey: 'sk-test' })
    expect(provider.name).toBe('openai')
  })

  it('throws for missing API key', () => {
    expect(() => createProvider({ provider: 'claude' })).toThrow('ANTHROPIC_API_KEY')
  })
})
