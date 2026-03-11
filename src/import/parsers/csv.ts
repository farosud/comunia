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
    const memberMap = new Map<string, ParsedMember>()

    // Skip header if present
    const start = lines[0]?.includes('timestamp') || lines[0]?.includes('sender') ? 1 : 0

    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(',')
      if (parts.length < 3) continue

      const [timestamp, sender, ...rest] = parts
      const text = rest.join(',').trim().replace(/^"|"$/g, '')
      const name = sender.trim().replace(/^"|"$/g, '')
      const messageTimestamp = new Date(timestamp.trim().replace(/^"|"$/g, ''))

      const existingMember = memberMap.get(name)
      if (!existingMember) {
        memberMap.set(name, {
          name,
          messageCount: 1,
          firstMessageAt: messageTimestamp,
          lastMessageAt: messageTimestamp,
        })
      } else {
        existingMember.messageCount = (existingMember.messageCount || 0) + 1
        if (!existingMember.firstMessageAt || messageTimestamp < existingMember.firstMessageAt) {
          existingMember.firstMessageAt = messageTimestamp
        }
        if (!existingMember.lastMessageAt || messageTimestamp > existingMember.lastMessageAt) {
          existingMember.lastMessageAt = messageTimestamp
        }
      }

      messages.push({
        sender: name,
        text,
        timestamp: messageTimestamp,
      })
    }

    return {
      messages,
      members: Array.from(memberMap.values()),
      source: filename,
      format: 'csv',
    }
  },
}
