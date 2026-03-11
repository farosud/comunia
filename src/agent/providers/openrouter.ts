import OpenAI from 'openai'
import type { LLMProvider, LLMMessage, LLMResponse, ToolDefinition } from './types.js'

export class OpenRouterProvider implements LLMProvider {
  name = 'openrouter'
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string = 'anthropic/claude-sonnet-4') {
    this.model = model
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/farosud/comunia',
        'X-Title': 'Comunia',
      },
    })
  }

  async chat(system: string, messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
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
        input: JSON.parse(tc.function.arguments),
      }))

    return { text, toolCalls }
  }
}
