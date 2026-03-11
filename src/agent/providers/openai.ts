import OpenAI from 'openai'
import type { LLMProvider, LLMMessage, LLMResponse, ToolDefinition } from './types.js'

export class OpenAIProvider implements LLMProvider {
  name = 'openai'
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async chat(system: string, messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
      ...(tools?.length ? {
        tools: tools.map(t => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      } : {}),
    })

    const choice = response.choices[0]
    const text = choice.message.content || ''
    const toolCalls = (choice.message.tool_calls || [])
      .filter(tc => tc.type === 'function')
      .map(tc => ({
        name: tc.function.name,
        input: safeParseToolArguments(tc.function.arguments),
      }))

    return { text, toolCalls }
  }
}

function safeParseToolArguments(args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
