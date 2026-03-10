export interface ParsedMessage {
  sender: string
  text: string
  timestamp: Date
  platform?: string
}

export interface ParsedMember {
  name: string
  platformId?: string
  platform?: string
}

export interface ParseResult {
  messages: ParsedMessage[]
  members: ParsedMember[]
  source: string
  format: string
}

export interface Parser {
  name: string
  canParse(filename: string, content: string): boolean
  parse(content: string, filename: string): ParseResult
}
