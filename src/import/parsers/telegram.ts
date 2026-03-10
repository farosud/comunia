import type { Parser, ParseResult, ParsedMessage, ParsedMember } from './types.js'

// Telegram JSON export format
export const telegramParser: Parser = {
  name: 'telegram',

  canParse(filename: string, content: string): boolean {
    if (filename.endsWith('.json')) {
      try {
        const data = JSON.parse(content)
        return data.type === 'personal_chat' || data.type === 'private_supergroup' || data.type === 'private_group' || !!data.messages
      } catch {
        return false
      }
    }
    return false
  },

  parse(content: string, filename: string): ParseResult {
    const data = JSON.parse(content)
    const messages: ParsedMessage[] = []
    const memberSet = new Map<string, ParsedMember>()

    for (const msg of data.messages || []) {
      if (msg.type !== 'message') continue
      const text = typeof msg.text === 'string' ? msg.text
        : Array.isArray(msg.text) ? msg.text.map((t: any) => typeof t === 'string' ? t : t.text || '').join('')
        : ''
      if (!text) continue

      const sender = msg.from || 'Unknown'
      const senderId = msg.from_id ? String(msg.from_id) : undefined

      if (!memberSet.has(sender)) {
        memberSet.set(sender, { name: sender, platformId: senderId, platform: 'telegram' })
      }

      messages.push({
        sender,
        text,
        timestamp: new Date(msg.date || msg.date_unixtime * 1000),
        platform: 'telegram',
      })
    }

    return {
      messages,
      members: Array.from(memberSet.values()),
      source: filename,
      format: 'telegram-export',
    }
  },
}
