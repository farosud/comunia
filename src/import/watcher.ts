import fs from 'fs'
import path from 'path'
import { scanFile } from './scanner.js'
import type { ImportAnalyzer } from './analyzer.js'
import type { ImportSeeder } from './seeder.js'
import type { ReasoningStream } from '../reasoning.js'

export class ImportWatcher {
  private watcher?: fs.FSWatcher
  private processing = new Set<string>()

  constructor(
    private inboxDir: string,
    private processedDir: string,
    private analyzer: ImportAnalyzer,
    private seeder: ImportSeeder,
    private reasoning: ReasoningStream,
  ) {}

  async start(): Promise<void> {
    // Ensure directories exist
    fs.mkdirSync(this.inboxDir, { recursive: true })
    fs.mkdirSync(this.processedDir, { recursive: true })

    // Process existing files
    const existing = fs.readdirSync(this.inboxDir).filter(f => !f.startsWith('.'))
    for (const file of existing) {
      await this.processFile(file)
    }

    // Watch for new files
    this.watcher = fs.watch(this.inboxDir, async (_eventType, filename) => {
      if (!filename || filename.startsWith('.') || this.processing.has(filename)) return
      // Small delay to ensure file is fully written
      setTimeout(() => this.processFile(filename), 1000)
    })

    console.log(`Import watcher started on ${this.inboxDir}`)

    // Keep alive
    await new Promise(() => {})
  }

  private async processFile(filename: string): Promise<void> {
    if (this.processing.has(filename)) return
    this.processing.add(filename)

    const filePath = path.join(this.inboxDir, filename)

    try {
      if (!fs.existsSync(filePath)) return

      this.reasoning.emit_reasoning({
        jobName: 'import', level: 'step',
        message: `New file detected: ${filename}`,
      })

      const parseResult = await scanFile(filePath)
      if (!parseResult) {
        this.reasoning.emit_reasoning({
          jobName: 'import', level: 'detail',
          message: `Could not parse ${filename} — unsupported format`,
        })
        return
      }

      const analysis = await this.analyzer.analyze(parseResult)
      const result = await this.seeder.seed(analysis, filename)

      // Move to processed
      const dest = path.join(this.processedDir, filename)
      fs.renameSync(filePath, dest)

      this.reasoning.emit_reasoning({
        jobName: 'import', level: 'decision',
        message: `Import complete: ${result.usersCreated} users created, ${result.memoriesStored} memories stored`,
      })
    } catch (err) {
      this.reasoning.emit_reasoning({
        jobName: 'import', level: 'step',
        message: `Failed to process ${filename}: ${err}`,
      })
    } finally {
      this.processing.delete(filename)
    }
  }

  stop(): void {
    this.watcher?.close()
  }
}
