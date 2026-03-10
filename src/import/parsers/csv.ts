import type { Parser, ParseResult, ParsedMessage, ParsedMember } from './types.js'

// CSV format: timestamp,sender,message
export const csvParser: Parser = {
  name: 'csv',

  canParse(filename: string, _content: string): boolean {
    return filename.endsWith('.csv')
  },

  parse(content: string, filename: string): ParseResult {
    const lines = content.split('\n').filter(l => l.trim())
    const messages: ParsedMessage[] = []
    const memberSet = new Set<string>()

    // Skip header if present
    const start = lines[0]?.includes('timestamp') || lines[0]?.includes('sender') ? 1 : 0

    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(',')
      if (parts.length < 3) continue

      const [timestamp, sender, ...rest] = parts
      const text = rest.join(',').trim().replace(/^"|"$/g, '')
      const name = sender.trim().replace(/^"|"$/g, '')

      memberSet.add(name)
      messages.push({
        sender: name,
        text,
        timestamp: new Date(timestamp.trim().replace(/^"|"$/g, '')),
      })
    }

    return {
      messages,
      members: Array.from(memberSet).map(name => ({ name })),
      source: filename,
      format: 'csv',
    }
  },
}
