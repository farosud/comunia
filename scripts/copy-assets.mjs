import fs from 'fs'
import path from 'path'

const rootDir = process.cwd()

const copies = [
  ['templates', 'dist/templates'],
  ['src/db/migrations', 'dist/src/db/migrations'],
  ['src/dashboard/public', 'dist/src/dashboard/public'],
]

for (const [source, destination] of copies) {
  fs.cpSync(
    path.join(rootDir, source),
    path.join(rootDir, destination),
    { recursive: true }
  )
}
