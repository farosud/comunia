import type { Parser, ParseResult } from './types.js'

// Fallback: treats entire file as a single text blob for LLM analysis
export const plaintextParser: Parser = {
  name: 'plaintext',

  canParse(filename: string, _content: string): boolean {
    return filename.endsWith('.txt') || filename.endsWith('.md')
  },

  parse(content: string, filename: string): ParseResult {
    return {
      messages: [{
        sender: 'unknown',
        text: content,
        timestamp: new Date(),
      }],
      members: [{
        name: 'unknown',
        messageCount: 1,
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
      }],
      source: filename,
      format: 'plaintext',
    }
  },
}
