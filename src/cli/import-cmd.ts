import * as p from '@clack/prompts'
import fs from 'fs'
import path from 'path'

export async function runImport(filePath?: string) {
  p.intro('comunia import')

  if (filePath) {
    // Direct file import
    if (!fs.existsSync(filePath)) {
      p.log.error(`File not found: ${filePath}`)
      return process.exit(1)
    }

    const dest = path.join('import', 'inbox', path.basename(filePath))
    fs.mkdirSync('import/inbox', { recursive: true })
    fs.copyFileSync(filePath, dest)
    p.log.success(`Copied ${filePath} to import/inbox/`)
    p.note('The file will be processed automatically when comunia starts.', 'Done')
  } else {
    // Interactive import
    p.note(
      'Drop files into the import/inbox/ directory:\n\n' +
      'Supported formats:\n' +
      '- WhatsApp chat export (.txt)\n' +
      '- Telegram JSON export (.json)\n' +
      '- CSV (timestamp, sender, message)\n' +
      '- Plain text / markdown\n\n' +
      'Files are processed automatically when comunia runs.',
      'Import Guide'
    )

    const files = await p.text({
      message: 'Path to file (or press Enter to skip):',
      defaultValue: '',
    })
    if (p.isCancel(files)) return process.exit(0)

    if (files && fs.existsSync(files)) {
      const dest = path.join('import', 'inbox', path.basename(files))
      fs.mkdirSync('import/inbox', { recursive: true })
      fs.copyFileSync(files, dest)
      p.log.success(`Copied to import/inbox/`)
    }
  }

  p.outro('Import ready!')
}
