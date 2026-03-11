import fs from 'fs'
import path from 'path'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { scanFile } from './scanner.js'
import type { ImportAnalyzer } from './analyzer.js'
import type { ImportSeeder } from './seeder.js'
import type { ReasoningStream } from '../reasoning.js'
import { importLog } from '../db/schema.js'

type Db = any

export class ImportWatcher {
  private watcher?: fs.FSWatcher
  private processing = new Set<string>()

  constructor(
    private db: Db,
    private inboxDir: string,
    private processedDir: string,
    private failedDir: string,
    private analyzer: ImportAnalyzer,
    private seeder: ImportSeeder,
    private reasoning: ReasoningStream,
  ) {}

  async start(): Promise<void> {
    // Ensure directories exist
    fs.mkdirSync(this.inboxDir, { recursive: true })
    fs.mkdirSync(this.processedDir, { recursive: true })
    fs.mkdirSync(this.failedDir, { recursive: true })
    this.recoverInterruptedJobs()

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
    const now = new Date().toISOString()

    try {
      if (!fs.existsSync(filePath)) return
      const job = this.ensureJob(filename)

      if (job) {
        this.db.update(importLog).set({
          status: 'processing',
          error: null,
          updatedAt: now,
        }).where(eq(importLog.id, job.id)).run()
      }

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
        this.markJobFailed(filename, 'Unsupported file format. Use a Telegram export JSON, WhatsApp export TXT, CSV, TXT, or MD file.')
        this.moveTo(this.failedDir, filePath, filename)
        return
      }

      const quickPass = await this.seeder.ingestMembers(parseResult)
      this.markJobProgress(filename, {
        type: parseResult.format,
        messagesProcessed: parseResult.messages.length,
        membersProcessed: parseResult.members.length,
        entriesExtracted: quickPass.memoriesStored,
      })
      this.reasoning.emit_reasoning({
        jobName: 'import',
        level: 'decision',
        message: `Quick pass complete: ${parseResult.members.length} members available in the dashboard, deeper analysis continuing in background`,
      })

      const analysis = await this.analyzer.analyze(parseResult)
      const result = await this.seeder.enrichMembers(parseResult, analysis)

      // Move to processed
      this.moveTo(this.processedDir, filePath, filename)
      this.markJobCompleted(filename, {
        type: parseResult.format,
        messagesProcessed: parseResult.messages.length,
        membersProcessed: parseResult.members.length,
        entriesExtracted: quickPass.memoriesStored + result.memoriesStored,
      })

      this.reasoning.emit_reasoning({
        jobName: 'import', level: 'decision',
        message: `Import complete: ${quickPass.usersCreated + result.usersCreated} users created, ${quickPass.memoriesStored + result.memoriesStored} memories stored`,
      })
    } catch (err) {
      this.markJobFailed(filename, err instanceof Error ? err.message : String(err))
      this.moveTo(this.failedDir, filePath, filename)
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

  private findLatestJob(filename: string) {
    return this.db.select().from(importLog)
      .where(eq(importLog.sourceFile, filename))
      .orderBy(desc(importLog.createdAt))
      .get()
  }

  private ensureJob(filename: string) {
    const existing = this.findLatestJob(filename)
    if (existing) return existing

    const now = new Date().toISOString()
    this.db.insert(importLog).values({
      id: randomUUID(),
      sourceFile: filename,
      type: 'uploaded',
      status: 'uploaded',
      error: null,
      messagesProcessed: 0,
      membersProcessed: 0,
      entriesExtracted: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      importedAt: now,
    }).run()

    return this.findLatestJob(filename)
  }

  private markJobCompleted(
    filename: string,
    details: { type: string; messagesProcessed: number; membersProcessed: number; entriesExtracted: number },
  ): void {
    const job = this.findLatestJob(filename)
    if (!job) return

    const now = new Date().toISOString()
    this.db.update(importLog).set({
      type: details.type,
      status: 'completed',
      error: null,
      messagesProcessed: details.messagesProcessed,
      membersProcessed: details.membersProcessed,
      entriesExtracted: details.entriesExtracted,
      importedAt: now,
      completedAt: now,
      updatedAt: now,
    }).where(eq(importLog.id, job.id)).run()
  }

  private markJobProgress(
    filename: string,
    details: { type: string; messagesProcessed: number; membersProcessed: number; entriesExtracted: number },
  ): void {
    const job = this.findLatestJob(filename)
    if (!job) return

    const now = new Date().toISOString()
    this.db.update(importLog).set({
      type: details.type,
      status: 'processing',
      messagesProcessed: details.messagesProcessed,
      membersProcessed: details.membersProcessed,
      entriesExtracted: details.entriesExtracted,
      updatedAt: now,
    }).where(eq(importLog.id, job.id)).run()
  }

  private markJobFailed(filename: string, error: string): void {
    const job = this.findLatestJob(filename)
    if (!job) return

    const now = new Date().toISOString()
    this.db.update(importLog).set({
      status: 'failed',
      error,
      completedAt: now,
      updatedAt: now,
    }).where(eq(importLog.id, job.id)).run()
  }

  private moveTo(targetDir: string, filePath: string, filename: string): void {
    if (!fs.existsSync(filePath)) return

    const destination = this.uniqueDestination(targetDir, filename)
    fs.renameSync(filePath, destination)
  }

  private uniqueDestination(targetDir: string, filename: string): string {
    const parsed = path.parse(filename)
    let candidate = path.join(targetDir, filename)
    let index = 1

    while (fs.existsSync(candidate)) {
      candidate = path.join(targetDir, `${parsed.name}-${index}${parsed.ext}`)
      index += 1
    }

    return candidate
  }

  private recoverInterruptedJobs(): void {
    const inboxFiles = new Set(fs.readdirSync(this.inboxDir).filter((filename) => !filename.startsWith('.')))
    const interruptedJobs = this.db.select().from(importLog)
      .where(eq(importLog.status, 'processing'))
      .all()

    const now = new Date().toISOString()
    for (const job of interruptedJobs) {
      if (!inboxFiles.has(job.sourceFile)) continue

      this.db.update(importLog).set({
        status: 'uploaded',
        error: 'The previous import run stopped before analysis finished. Retrying now.',
        updatedAt: now,
        completedAt: null,
      }).where(eq(importLog.id, job.id)).run()
    }
  }
}
