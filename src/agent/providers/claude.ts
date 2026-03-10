import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, LLMMessage, LLMResponse, ToolDefinition } from './types.js'

export class ClaudeProvider implements LLMProvider {
  name = 'claude'
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async chat(system: string, messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      ...(tools?.length ? {
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
      } : {}),
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({ name: b.name, input: b.input as Record<string, unknown> }))

    return { text, toolCalls }
  }
}
