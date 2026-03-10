import { describe, it, expect } from 'vitest'
import { whatsappParser } from '../import/parsers/whatsapp.js'
import { telegramParser } from '../import/parsers/telegram.js'
import { csvParser } from '../import/parsers/csv.js'
import { plaintextParser } from '../import/parsers/plaintext.js'
import { scanFile } from '../import/scanner.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('WhatsApp Parser', () => {
  const sample = `12/03/2026, 14:30 - Emi: Hola a todos
12/03/2026, 14:31 - Ana: Hola! Cómo están?
12/03/2026, 14:32 - Emi: Hagamos un asado este sábado`

  it('detects WhatsApp export format', () => {
    expect(whatsappParser.canParse('chat.txt', sample)).toBe(true)
  })

  it('parses messages and members', () => {
    const result = whatsappParser.parse(sample, 'chat.txt')
    expect(result.messages).toHaveLength(3)
    expect(result.members).toHaveLength(2)
    expect(result.messages[0].sender).toBe('Emi')
    expect(result.messages[0].text).toBe('Hola a todos')
    expect(result.format).toBe('whatsapp-export')
  })
})

describe('Telegram Parser', () => {
  const sample = JSON.stringify({
    type: 'personal_chat',
    messages: [
      { type: 'message', from: 'Emi', from_id: 'user123', text: 'Hola!', date: '2026-03-12T14:30:00' },
      { type: 'message', from: 'Ana', from_id: 'user456', text: 'Che, vamos a comer?', date: '2026-03-12T14:31:00' },
      { type: 'service', from: 'Bot', text: 'joined' },
    ],
  })

  it('detects Telegram JSON export', () => {
    expect(telegramParser.canParse('result.json', sample)).toBe(true)
  })

  it('parses only message types', () => {
    const result = telegramParser.parse(sample, 'result.json')
    expect(result.messages).toHaveLength(2) // Skips service message
    expect(result.members).toHaveLength(2)
    expect(result.format).toBe('telegram-export')
  })
})

describe('CSV Parser', () => {
  const sample = `timestamp,sender,message
2026-03-12T14:30:00,Emi,"Hola a todos"
2026-03-12T14:31:00,Ana,"Hagamos algo"`

  it('detects CSV files', () => {
    expect(csvParser.canParse('data.csv', sample)).toBe(true)
  })

  it('parses CSV with header', () => {
    const result = csvParser.parse(sample, 'data.csv')
    expect(result.messages).toHaveLength(2)
    expect(result.members).toHaveLength(2)
  })
})

describe('Plaintext Parser', () => {
  it('accepts .txt and .md files', () => {
    expect(plaintextParser.canParse('notes.txt', 'anything')).toBe(true)
    expect(plaintextParser.canParse('notes.md', 'anything')).toBe(true)
  })

  it('wraps content as single message', () => {
    const result = plaintextParser.parse('Hello world', 'notes.txt')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].text).toBe('Hello world')
  })
})

describe('Scanner', () => {
  it('auto-detects file type', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-import-'))
    const waContent = '12/03/2026, 14:30 - Emi: Hola\n12/03/2026, 14:31 - Ana: Chau'
    fs.writeFileSync(path.join(tmpDir, 'chat.txt'), waContent)

    const result = await scanFile(path.join(tmpDir, 'chat.txt'))
    expect(result).not.toBeNull()
    expect(result!.format).toBe('whatsapp-export')

    fs.rmSync(tmpDir, { recursive: true })
  })
})
