import { randomUUID } from 'crypto'
import type { LLMProvider } from '../agent/providers/types.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import type { Config } from '../config.js'
import { importLog, productIdeas, userMemory, users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

type Db = any

interface ProductIdeaInput {
  title: string
  summary: string
  targetMembers?: string
  rationale?: string
  buildPrompt: string
  source?: string
}

interface IdeaCommunityContext {
  name: string
  type?: string
  location?: string
}

interface ExternalIdeaAnalysisInput {
  community: IdeaCommunityContext
  signalSummary: string
  count?: number
  existingTitles?: string[]
  soul?: string
  memory?: string
}

export class ProductIdeas {
  constructor(
    private db: Db,
    private llm: LLMProvider,
    private agentMemory: AgentMemory,
    private config: Config,
  ) {}

  async getDashboardState() {
    const hasImportedContext = this.hasImportedContext()
    if (hasImportedContext) {
      await this.ensureSeeded()
    }

    const ideas = this.listIdeas()
    return {
      hasImportedContext,
      importSummary: this.getImportSummary(),
      ideas,
      daioUrl: 'https://daio.md/',
    }
  }

  async ensureSeeded(reason?: (level: string, message: string) => void) {
    if (!this.hasImportedContext()) return this.listIdeas()

    const currentIdeas = this.listIdeas()
    if (currentIdeas.length >= 3) return currentIdeas

    const created = await this.generateIdeas(3 - currentIdeas.length, 'seed', reason)
    if (created > 0) {
      reason?.('decision', `Created ${created} starter product ideas from imported community signals`)
    }
    return this.listIdeas()
  }

  async generateDailyIdea(reason?: (level: string, message: string) => void) {
    if (!this.hasImportedContext()) {
      reason?.('detail', 'Skipping product idea generation because there is no imported community data yet')
      return this.listIdeas()
    }

    const ideas = this.listIdeas()
    if (ideas.length < 3) {
      return this.ensureSeeded(reason)
    }

    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
    const alreadyCreatedToday = ideas.some((idea: any) => new Date(idea.createdAt).getTime() >= oneDayAgo)
    if (alreadyCreatedToday) {
      reason?.('detail', 'Skipping product idea generation because one was already created in the last 24 hours')
      return ideas
    }

    const created = await this.generateIdeas(1, 'agent', reason)
    reason?.('decision', created > 0
      ? `Created ${created} new product idea for the admin dashboard`
      : 'No new product idea was created after deduplication')

    return this.listIdeas()
  }

  listIdeas() {
    return this.db.select().from(productIdeas)
      .where(eq(productIdeas.status, 'open'))
      .all()
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  async createIdea(input: ProductIdeaInput) {
    const now = new Date().toISOString()
    const idea = {
      id: randomUUID(),
      title: input.title,
      summary: input.summary,
      targetMembers: input.targetMembers || null,
      rationale: input.rationale || null,
      buildPrompt: input.buildPrompt,
      source: input.source || 'agent',
      status: 'open',
      createdAt: now,
    }
    this.db.insert(productIdeas).values(idea).run()
    return idea
  }

  async analyzeExternalSignals(input: ExternalIdeaAnalysisInput) {
    const count = Math.max(1, Math.min(input.count || 3, 8))
    const ideas = await this.generateIdeaCandidates({
      community: input.community,
      signalSummary: input.signalSummary,
      count,
      existingTitles: input.existingTitles || [],
      soul: input.soul,
      memory: input.memory,
      fallbackSource: 'reddit-preview',
    })

    return {
      community: input.community,
      signalSummary: input.signalSummary,
      ideas,
    }
  }

  private hasImportedContext() {
    const imports = this.db.select().from(importLog).all()
    if (imports.some((row: any) => (row.membersProcessed || 0) > 0 || (row.entriesExtracted || 0) > 0 || (row.messagesProcessed || 0) > 0)) {
      return true
    }

    const importedMemory = this.db.select().from(userMemory).all()
      .some((row: any) => row.source === 'import')
    return importedMemory
  }

  private getImportSummary() {
    const imports = this.db.select().from(importLog).all()
    const totalMessages = imports.reduce((sum: number, row: any) => sum + (row.messagesProcessed || 0), 0)
    const totalMembers = imports.reduce((sum: number, row: any) => sum + (row.membersProcessed || 0), 0)
    return {
      imports: imports.length,
      totalMessages,
      totalMembers,
    }
  }

  private async generateIdeas(
    count: number,
    source: 'seed' | 'agent',
    reason?: (level: string, message: string) => void,
  ) {
    const existingIdeas = this.listIdeas()
    const recentTitles = existingIdeas.slice(0, 12).map((idea: any) => idea.title)
    const activeMembers = this.db.select().from(users)
      .where(eq(users.status, 'active'))
      .all()
    const importedSignals = this.db.select().from(userMemory).all()
      .filter((row: any) => row.source === 'import')

    const soul = await this.agentMemory.getSoul().catch(() => '')
    const memory = await this.agentMemory.getMemory().catch(() => '')
    reason?.('detail', `Assembling imported signals for ${count} product idea${count === 1 ? '' : 's'}`)
    const signalSummary = buildSignalSummary(importedSignals, activeMembers)
    const ideas = await this.generateIdeaCandidates({
      community: this.config.community,
      signalSummary,
      count,
      existingTitles: recentTitles,
      soul,
      memory,
      fallbackSource: source,
      onFallback: () => {
        reason?.('detail', 'Falling back to deterministic product idea generation')
      },
    })

    let created = 0
    const normalizedExisting = new Set(existingIdeas.map((idea: any) => String(idea.title || '').trim().toLowerCase()))
    for (const idea of ideas.slice(0, count)) {
      const title = String(idea.title || '').trim()
      if (!title) continue

      const normalizedTitle = title.toLowerCase()
      if (normalizedExisting.has(normalizedTitle)) continue

      await this.createIdea({
        title,
        summary: String(idea.summary || 'A community-shaped product opportunity worth testing.').trim(),
        targetMembers: String(idea.targetMembers || '').trim() || undefined,
        rationale: String(idea.rationale || '').trim(),
        buildPrompt: String(idea.buildPrompt || defaultBuildPrompt(title, this.config.community)).trim(),
        source,
      })
      normalizedExisting.add(normalizedTitle)
      created++
    }

    return created
  }

  private async generateIdeaCandidates(input: {
    community: IdeaCommunityContext
    signalSummary: string
    count: number
    existingTitles: string[]
    soul?: string
    memory?: string
    fallbackSource: 'seed' | 'agent' | 'reddit-preview'
    onFallback?: () => void
  }) {
    let ideas = fallbackProductIdeas(input.community, input.fallbackSource, input.count)

    try {
      const response = await this.llm.chat(
        buildIdeaGenerationPrompt({
          community: input.community,
          signalSummary: input.signalSummary,
          recentTitles: input.existingTitles,
          soul: input.soul || '',
          memory: input.memory || '',
          count: input.count,
        }),
        [{
          role: 'user',
          content: `Propose ${input.count} software product ideas this community would plausibly want built next.`,
        }],
      )

      const parsed = JSON.parse(response.text)
      if (Array.isArray(parsed) && parsed.length > 0) {
        ideas = parsed
      }
    } catch {
      input.onFallback?.()
    }

    return ideas.slice(0, input.count).map((idea) => ({
      title: String(idea.title || '').trim(),
      summary: String(idea.summary || 'A community-shaped product opportunity worth testing.').trim(),
      targetMembers: String(idea.targetMembers || '').trim() || undefined,
      rationale: String(idea.rationale || '').trim() || undefined,
      buildPrompt: String(idea.buildPrompt || defaultBuildPrompt(String(idea.title || '').trim(), input.community)).trim(),
      source: input.fallbackSource,
    })).filter((idea) => idea.title)
  }
}

function buildSignalSummary(memoryRows: any[], members: any[]) {
  const byUser = new Map<string, string[]>()
  for (const row of memoryRows) {
    const list = byUser.get(row.userId) || []
    list.push(`${row.category}.${row.key}=${row.value}`)
    byUser.set(row.userId, list)
  }

  return members.map((member: any) => {
    const signals = byUser.get(member.id) || []
    return `${member.name}: ${signals.slice(0, 12).join(', ') || 'no imported signals yet'}`
  }).join('\n')
}

function buildIdeaGenerationPrompt(input: {
  community: IdeaCommunityContext
  signalSummary: string
  recentTitles: string[]
  soul: string
  memory: string
  count: number
}) {
  return `You are helping a community admin decide what small software products or tools to build for their community.

Community:
- Name: ${input.community.name}
- Type: ${input.community.type || 'not specified'}
- Location: ${input.community.location || 'not specified'}

Imported community signal summary:
${truncate(input.signalSummary, 5000)}

Existing product idea titles:
${input.recentTitles.join('\n') || 'None'}

Soul:
${truncate(input.soul, 2500) || 'No soul content yet'}

Memory:
${truncate(input.memory, 2500) || 'No community memory yet'}

Return a JSON array with exactly ${input.count} ideas:
[
  {
    "title": "...",
    "summary": "...",
    "targetMembers": "...",
    "rationale": "...",
    "buildPrompt": "A copy-paste-ready prompt for a local coding agent to build an MVP."
  }
]

Requirements:
- The products should feel directly useful for this community.
- Favor small but real tools over giant startups.
- Make the buildPrompt concrete and action-oriented.
- Do not repeat existing titles.
- Keep the admin-facing summary concise.`
}

function fallbackProductIdeas(
  communityConfig: Pick<IdeaCommunityContext, 'name'>,
  source: 'seed' | 'agent' | 'reddit-preview',
  count: number,
) {
  const community = communityConfig.name
  const ideas = [
    {
      title: `${community} member map`,
      summary: 'A lightweight internal directory that clusters members by what they are building, what they like talking about, and who they want to meet.',
      targetMembers: 'Admins and members trying to find the right people quickly',
      rationale: 'Imported conversations usually surface hidden adjacency that is hard to see in chat history alone.',
      buildPrompt: defaultBuildPrompt(`${community} member map`, communityConfig),
    },
    {
      title: `${community} plan matcher`,
      summary: 'A small tool that turns vague ideas like dinners, asados, or topic chats into concrete proposed plans with the right members attached.',
      targetMembers: 'Members who want to organize something without doing all the coordination themselves',
      rationale: 'The community already produces early plan signals in chat; a product can structure them before they disappear.',
      buildPrompt: defaultBuildPrompt(`${community} plan matcher`, communityConfig),
    },
    {
      title: `${community} interest radar`,
      summary: 'A dashboard that surfaces recurring topics, product requests, and under-served conversations from imported community discussions.',
      targetMembers: 'Admins trying to spot what this community wants next',
      rationale: 'A signal layer makes community demand more legible than scrolling message exports.',
      buildPrompt: defaultBuildPrompt(`${community} interest radar`, communityConfig),
    },
    {
      title: `${community} founder helper library`,
      summary: 'A searchable knowledge shelf for the most repeated tools, resources, and operators mentioned by members.',
      targetMembers: 'Members asking the same practical questions over and over',
      rationale: 'Repeated requests usually point to a productable community utility.',
      buildPrompt: defaultBuildPrompt(`${community} founder helper library`, communityConfig),
    },
  ]

  if (source === 'seed') return ideas.slice(0, count)
  if (source === 'reddit-preview') return ideas.slice(1, 1 + count)
  return ideas.slice(2, 2 + count)
}

function defaultBuildPrompt(title: string, community: IdeaCommunityContext) {
  return `Build an MVP for "${title}" for the ${community.name} community.

Context:
- This is for a ${community.type || 'community'} community${community.location ? ` based around ${community.location}` : ''}.
- The product should feel small, useful, and shippable in a few days.
- Prioritize clarity, fast setup, and obvious value for community members.

Please produce:
1. A one-paragraph product spec.
2. A tight feature list for v1.
3. A simple technical architecture.
4. The first implementation steps for a local project.
5. A clean starter UI with one core workflow working end to end.`
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...` : value
}
