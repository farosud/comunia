import type { Parser, ParseResult, ParsedMessage, ParsedMember } from './types.js'

// WhatsApp export format: "DD/MM/YYYY, HH:MM - Name: Message"
// Also handles: "MM/DD/YY, HH:MM AM/PM - Name: Message"
const WA_LINE_REGEX = /^(\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\s*-\s*(.+?):\s*(.+)$/

export const whatsappParser: Parser = {
  name: 'whatsapp',

  canParse(filename: string, content: string): boolean {
    if (filename.endsWith('.txt') && content.includes(' - ')) {
      const lines = content.split('\n').slice(0, 10)
      return lines.some(l => WA_LINE_REGEX.test(l))
    }
    return false
  },

  parse(content: string, filename: string): ParseResult {
    const messages: ParsedMessage[] = []
    const memberMap = new Map<string, ParsedMember>()

    for (const line of content.split('\n')) {
      const match = line.match(WA_LINE_REGEX)
      if (!match) continue

      const [, dateStr, sender, text] = match
      const timestamp = parseWhatsAppDate(dateStr)
      const existingMember = memberMap.get(sender)
      if (!existingMember) {
        memberMap.set(sender, {
          name: sender,
          platform: 'whatsapp',
          messageCount: 1,
          firstMessageAt: timestamp,
          lastMessageAt: timestamp,
        })
      } else {
        existingMember.messageCount = (existingMember.messageCount || 0) + 1
        if (!existingMember.firstMessageAt || timestamp < existingMember.firstMessageAt) {
          existingMember.firstMessageAt = timestamp
        }
        if (!existingMember.lastMessageAt || timestamp > existingMember.lastMessageAt) {
          existingMember.lastMessageAt = timestamp
        }
      }

      messages.push({
        sender,
        text,
        timestamp,
        platform: 'whatsapp',
      })
    }

    const members: ParsedMember[] = Array.from(memberMap.values())

    return { messages, members, source: filename, format: 'whatsapp-export' }
  },
}

function parseWhatsAppDate(dateStr: string): Date {
  // Try common formats
  const cleaned = dateStr.replace(',', '').trim()
  const date = new Date(cleaned)
  if (!isNaN(date.getTime())) return date

  // Fallback: manual parse for DD/MM/YYYY HH:MM
  const parts = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/)
  if (parts) {
    const [, d, m, y, h, min] = parts
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y)
    return new Date(year, parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min))
  }

  return new Date()
}
