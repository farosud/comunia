import fs from 'fs'
import path from 'path'
import process from 'process'

const repoRoot = process.cwd()
const templatesRoot = path.resolve(repoRoot, '../comunia-agent-templates')
const outputPath = path.join(repoRoot, 'landing', 'marketplace-data.js')

if (!fs.existsSync(templatesRoot)) {
  throw new Error(`Template directory not found: ${templatesRoot}`)
}

const entries = fs.readdirSync(templatesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const slug = entry.name
    const agent = fs.readFileSync(path.join(templatesRoot, slug, 'agent.md'), 'utf8')
    const soul = fs.readFileSync(path.join(templatesRoot, slug, 'soul.md'), 'utf8')
    return {
      slug,
      title: slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
      summary: firstParagraph(agent) || firstParagraph(soul) || 'A starter operating prompt for this community type.',
      agent,
      soul,
    }
  })
  .sort((a, b) => a.title.localeCompare(b.title))

const content = `window.COMUNIA_MARKETPLACE = ${JSON.stringify(entries, null, 2)};\n`
fs.writeFileSync(outputPath, content)
console.log(`Generated ${entries.length} marketplace templates -> ${outputPath}`)

function firstParagraph(markdown) {
  const lines = markdown.split('\n').map((line) => line.trim())
  return lines.find((line) => line && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('##'))
}
