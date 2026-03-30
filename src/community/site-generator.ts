import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import type { LLMProvider } from '../agent/providers/types.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import type { Config } from '../config.js'
import { PublicPortal } from './public-portal.js'

type Db = any

const planSchema = z.object({
  mode: z.enum(['ai', 'fallback']).default('ai'),
  generatedAt: z.string(),
  rationale: z.string(),
  hero: z.object({
    eyebrow: z.string(),
    title: z.string(),
    subtitle: z.string(),
    note: z.string(),
  }),
  stats: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.string(),
  })).min(2).max(4),
  sections: z.array(z.object({
    id: z.string(),
    kicker: z.string(),
    title: z.string(),
    note: z.string(),
    kind: z.enum(['showcase', 'ideas', 'members', 'events', 'signals']),
    items: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      label: z.string().optional(),
      meta: z.string().optional(),
      href: z.string().url().optional(),
      ideaId: z.string().optional(),
      upvotes: z.number().optional(),
      downvotes: z.number().optional(),
    })).min(1).max(4),
  })).min(2).max(4),
})

export type CommunityShowcasePlan = z.infer<typeof planSchema>

interface ImportSignals {
  snippets: Array<{ id: string; from: string; text: string }>
  links: Array<{ id: string; title: string; href: string; by: string; context: string }>
}

export class CommunitySiteGenerator {
  private cache?: { key: string; generatedAt: number; plan: CommunityShowcasePlan }

  constructor(
    private db: Db,
    private llm: LLMProvider,
    private agentMemory: AgentMemory,
    private config: Config,
  ) {}

  async generate(options: { refresh?: boolean } = {}): Promise<CommunityShowcasePlan> {
    const snapshot = await new PublicPortal(this.db, this.config).getPublicSnapshot()
    const signals = this.readImportSignals()
    const cacheKey = JSON.stringify({
      community: snapshot.community,
      members: (snapshot.members || []).map((member: any) => member.name),
      events: (snapshot.upcomingEvents || []).map((event: any) => `${event.title}:${event.date}`),
      ideas: (snapshot.ideas || []).map((idea: any) => `${idea.id}:${idea.title}`),
      signals,
    })

    if (!options.refresh && this.cache && this.cache.key === cacheKey && (Date.now() - this.cache.generatedAt) < 5 * 60 * 1000) {
      return hydratePlan(this.cache.plan, snapshot)
    }

    const plan = await this.generateWithModel(snapshot, signals).catch(() => fallbackPlan(snapshot, signals, this.config))
    this.cache = { key: cacheKey, generatedAt: Date.now(), plan }
    return hydratePlan(plan, snapshot)
  }

  private async generateWithModel(snapshot: Awaited<ReturnType<PublicPortal['getPublicSnapshot']>>, signals: ImportSignals): Promise<CommunityShowcasePlan> {
    const soul = truncate(await this.agentMemory.getSoul().catch(() => ''), 1800)
    const memory = truncate(await this.agentMemory.getMemory().catch(() => ''), 2200)
    const ideas = (snapshot.ideas || []).map((idea: any) => ({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      rationale: idea.rationale,
      format: idea.format,
      upvotes: idea.upvotes || 0,
      downvotes: idea.downvotes || 0,
    }))

    const response = await this.llm.chat(
      `You are curating a generated community homepage for a builders group.

Use the evidence to decide what this specific group most wants to see first.

Principles:
- Prioritize real proof of energy: actual builds, shared links, concrete projects, recurring interests, and distinctive group tone.
- For a side-project builders group, it is usually better to showcase what people are making than to lead with generic networking language.
- Only use people, links, events, and ideas that appear in the evidence.
- Keep copy tight, vivid, and specific.
- Sections should feel editorial, not dashboard-y.
- Return JSON only.

Return an object with this exact shape:
{
  "mode": "ai",
  "generatedAt": "${new Date().toISOString()}",
  "rationale": "one concise sentence explaining what you chose to emphasize",
  "hero": {
    "eyebrow": "...",
    "title": "...",
    "subtitle": "...",
    "note": "..."
  },
  "stats": [
    { "id": "members", "label": "...", "value": "..." }
  ],
  "sections": [
    {
      "id": "featured-builds",
      "kicker": "...",
      "title": "...",
      "note": "...",
      "kind": "showcase|ideas|members|events|signals",
      "items": [
        {
          "id": "item-1",
          "title": "...",
          "description": "...",
          "label": "...",
          "meta": "...",
          "href": "https://...",
          "ideaId": "only when kind=ideas",
          "upvotes": 0,
          "downvotes": 0
        }
      ]
    }
  ]
}

Requirements:
- Include 2 to 4 sections.
- Include 1 to 4 items per section.
- Include at least one section of kind "showcase" or "signals".
- Only include href values from the shared links list.
- Only include ideaId values from the available ideas list.
- Use strings for stat values.
- If there are no events, do not create an events section.`,
      [{
        role: 'user',
        content: [
          'Community',
          JSON.stringify(snapshot.community, null, 2),
          '',
          `Visible members (${(snapshot.members || []).length})`,
          JSON.stringify((snapshot.members || []).map((member: any) => member.name), null, 2),
          '',
          'Upcoming events',
          JSON.stringify(snapshot.upcomingEvents || [], null, 2),
          '',
          'Available ideas',
          JSON.stringify(ideas, null, 2),
          '',
          'Shared links you may reference',
          JSON.stringify(signals.links, null, 2),
          '',
          'Representative chat snippets',
          JSON.stringify(signals.snippets, null, 2),
          '',
          'Soul',
          soul || 'No soul content yet.',
          '',
          'Memory',
          memory || 'No memory content yet.',
        ].join('\n'),
      }],
    )

    const parsed = JSON.parse(extractJsonObject(response.text))
    const plan = planSchema.parse(parsed)
    return {
      ...plan,
      mode: 'ai',
      generatedAt: new Date().toISOString(),
    }
  }

  private readImportSignals(): ImportSignals {
    const filePath = path.join(process.cwd(), 'import', 'processed', 'result.json')
    if (!fs.existsSync(filePath)) return { snippets: [], links: [] }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const messages = Array.isArray(parsed.messages) ? parsed.messages : []
      const textMessages: Array<{ from: string; text: string }> = messages
        .filter((message: any) => message.type === 'message')
        .map((message: any) => ({
          from: message.from || message.actor || 'Unknown',
          text: normalizeMessageText(message.text).trim(),
        }))
        .filter((message: { from: string; text: string }) => message.text.length > 0)

      const snippets: ImportSignals['snippets'] = textMessages.slice(0, 10).map((message, index) => ({
        id: `snippet-${index + 1}`,
        from: message.from,
        text: truncate(message.text, 220),
      }))

      const links: ImportSignals['links'] = textMessages
        .flatMap((message, index) => extractUrls(message.text).map((href, linkIndex) => ({
          id: `link-${index + 1}-${linkIndex + 1}`,
          title: simplifyUrl(href),
          href,
          by: message.from,
          context: truncate(message.text, 180),
        })))
        .filter((entry, index, list) => list.findIndex((candidate) => candidate.href === entry.href) === index)
        .slice(0, 8)

      return { snippets, links }
    } catch {
      return { snippets: [], links: [] }
    }
  }
}

function fallbackPlan(snapshot: any, signals: ImportSignals, config: Config): CommunityShowcasePlan {
  const members = snapshot.members || []
  const ideas = snapshot.ideas || []
  const events = snapshot.upcomingEvents || []
  const showcaseItems = signals.links.slice(0, 3).map((link) => ({
    id: link.id,
    title: link.title,
    description: link.context,
    label: 'Shared build',
    meta: `Posted by ${link.by}`,
    href: link.href,
  }))
  const signalItems = signals.snippets.slice(0, 3).map((snippet) => ({
    id: snippet.id,
    title: snippet.from,
    description: snippet.text,
    label: 'Group signal',
    meta: 'Imported chat',
  }))

  const sections: CommunityShowcasePlan['sections'] = []

  if (showcaseItems.length) {
    sections.push({
      id: 'featured-builds',
      kicker: 'What people are shipping',
      title: 'Builds already moving through the chat',
      note: 'The fastest way to understand a side-project group is to look at what members actually drop into the room.',
      kind: 'showcase' as const,
      items: showcaseItems,
    })
  }

  if (ideas.length) {
    sections.push({
      id: 'idea-stream',
      kicker: 'Agent stream',
      title: 'Ideas the group can push next',
      note: 'These still use the existing backend voting flow.',
      kind: 'ideas' as const,
      items: ideas.slice(0, 4).map((idea: any) => ({
        id: idea.id,
        title: idea.title,
        description: idea.description || 'Potential next move for the community.',
        label: idea.format || 'idea',
        meta: idea.rationale || '',
        ideaId: idea.id,
        upvotes: Number(idea.upvotes || 0),
        downvotes: Number(idea.downvotes || 0),
      })),
    })
  }

  if (signalItems.length) {
    sections.push({
      id: 'group-signals',
      kicker: 'Tone',
      title: 'What the room sounds like',
      note: 'The vibe is builder-first, casual, and unapologetically experimental.',
      kind: 'signals' as const,
      items: signalItems,
    })
  }

  if (members.length) {
    sections.push({
      id: 'builders',
      kicker: 'People',
      title: 'The builders currently in the room',
      note: 'A lightweight visible roster for who is inside the group.',
      kind: 'members' as const,
      items: members.slice(0, 4).map((member: any, index: number) => ({
        id: member.id || `member-${index}`,
        title: member.name || 'Anonymous member',
        description: `Status: ${member.status || 'active'}`,
        label: 'Member',
        meta: member.joinedAt ? `Joined ${member.joinedAt}` : 'Active now',
      })),
    })
  }

  if (events.length) {
    sections.push({
      id: 'events',
      kicker: 'Upcoming',
      title: 'Next moments for the group',
      note: 'Events still matter, but they are not the lead story unless the feed is empty.',
      kind: 'events' as const,
      items: events.slice(0, 3).map((event: any, index: number) => ({
        id: event.id || `event-${index}`,
        title: event.title || 'Untitled event',
        description: event.location || 'Location TBD',
        label: 'Upcoming event',
        meta: event.date || 'Date TBD',
      })),
    })
  }

  return {
    mode: 'fallback',
    generatedAt: new Date().toISOString(),
    rationale: 'The fallback emphasizes real shared builds first because that is the clearest signal of what a side-project group cares about.',
    hero: {
      eyebrow: 'generated showcase',
      title: config.community.name,
      subtitle: [config.community.type, config.community.location].filter(Boolean).join(' · '),
      note: 'A generated front page that tries to lead with the most concrete builder signal available instead of a generic community summary.',
    },
    stats: [
      { id: 'members', label: 'Visible builders', value: String(members.length) },
      { id: 'links', label: 'Shared links surfaced', value: String(signals.links.length) },
      { id: 'ideas', label: 'Ideas in rotation', value: String(ideas.length) },
    ],
    sections: sections.slice(0, 4),
  }
}

function hydratePlan(plan: CommunityShowcasePlan, snapshot: any): CommunityShowcasePlan {
  const ideasById = new Map((snapshot.ideas || []).map((idea: any) => [idea.id, idea]))

  return {
    ...plan,
    sections: plan.sections.map((section) => {
      if (section.kind !== 'ideas') return section
      return {
        ...section,
        items: section.items.map((item) => {
          const latest: any = ideasById.get(item.ideaId || item.id)
          if (!latest) return item
          return {
            ...item,
            upvotes: Number(latest.upvotes || 0),
            downvotes: Number(latest.downvotes || 0),
          }
        }),
      }
    }),
  }
}

function normalizeMessageText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part) return String((part as any).text || '')
      return ''
    }).join('')
  }
  return ''
}

function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/[^\s)]+/g)).map((match) => match[0])
}

function simplifyUrl(href: string): string {
  try {
    const url = new URL(href)
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return href
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function extractJsonObject(value: string): string {
  const firstBrace = value.indexOf('{')
  const lastBrace = value.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return value.slice(firstBrace, lastBrace + 1)
  }
  return value
}
