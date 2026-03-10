import type { AnalysisResult } from './analyzer.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import { users, importLog } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

type Db = any

export class ImportSeeder {
  constructor(
    private db: Db,
    private userMemory: UserMemory,
    private agentMemory: AgentMemory,
  ) {}

  async seed(analysis: AnalysisResult, source: string): Promise<{ usersCreated: number; memoriesStored: number }> {
    let usersCreated = 0
    let memoriesStored = 0

    for (const profile of analysis.memberProfiles) {
      // Find or create user
      let user = this.db.select().from(users).where(eq(users.name, profile.name)).get()

      if (!user) {
        const id = randomUUID()
        this.db.insert(users).values({
          id,
          name: profile.name,
          status: 'active',
          joinedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        }).run()
        user = { id }
        usersCreated++
      }

      // Store traits
      for (const trait of profile.traits) {
        await this.userMemory.set(
          user.id, trait.category, trait.key, trait.value, trait.confidence, 'import',
        )
        memoriesStored++
      }
    }

    // Update agent memory if suggested
    if (analysis.suggestedMemory) {
      const currentMemory = await this.agentMemory.getMemory()
      if (currentMemory.includes('Nothing yet') || currentMemory.trim() === '# Memory') {
        await this.agentMemory.updateMemory(analysis.suggestedMemory)
      }
    }

    // Log the import
    this.db.insert(importLog).values({
      id: randomUUID(),
      sourceFile: source,
      type: 'chat-import',
      messagesProcessed: 0,
      membersProcessed: analysis.memberProfiles.length,
      entriesExtracted: memoriesStored,
      importedAt: new Date().toISOString(),
    }).run()

    return { usersCreated, memoriesStored }
  }
}
