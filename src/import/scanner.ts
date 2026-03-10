import type { Parser, ParseResult } from './parsers/types.js'
import { whatsappParser } from './parsers/whatsapp.js'
import { telegramParser } from './parsers/telegram.js'
import { csvParser } from './parsers/csv.js'
import { plaintextParser } from './parsers/plaintext.js'
import fs from 'fs/promises'
import path from 'path'

// Order matters — more specific parsers first, plaintext last as fallback
const parsers: Parser[] = [
  telegramParser,
  whatsappParser,
  csvParser,
  plaintextParser,
]

export async function scanFile(filePath: string): Promise<ParseResult | null> {
  const content = await fs.readFile(filePath, 'utf-8')
  const filename = path.basename(filePath)

  for (const parser of parsers) {
    if (parser.canParse(filename, content)) {
      return parser.parse(content, filename)
    }
  }

  return null
}

export async function scanDirectory(dir: string): Promise<{ file: string; result: ParseResult }[]> {
  const files = await fs.readdir(dir)
  const results: { file: string; result: ParseResult }[] = []

  for (const file of files) {
    if (file.startsWith('.')) continue
    const filePath = path.join(dir, file)
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) continue

    const result = await scanFile(filePath)
    if (result) {
      results.push({ file, result })
    }
  }

  return results
}
