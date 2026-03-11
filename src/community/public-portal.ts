import { randomUUID } from 'crypto'
import { and, eq, gt } from 'drizzle-orm'
import { communityIdeas, communityIdeaVotes, communitySettings, events, users } from '../db/schema.js'
import type { Config } from '../config.js'

type Db = any

export interface PublicPortalSettings {
  passcode: string
  botUrl: string
}

export class PublicPortal {
  constructor(private db: Db, private config: Config) {}

  async getSettings(): Promise<PublicPortalSettings> {
    await this.ensureDefaults()
    const rows = this.db.select().from(communitySettings).all()
    const map = new Map<string, string>(rows.map((row: any) => [row.key, row.value]))
    return {
      passcode: map.get('public_passcode') || this.config.publicPortal.passcode,
      botUrl: map.get('public_bot_url') || this.config.publicPortal.botUrl,
    }
  }

  async updateSettings(input: Partial<PublicPortalSettings>): Promise<PublicPortalSettings> {
    const current = await this.getSettings()
    const next = {
      passcode: input.passcode ?? current.passcode,
      botUrl: input.botUrl ?? current.botUrl,
    }

    await this.setSetting('public_passcode', next.passcode)
    await this.setSetting('public_bot_url', next.botUrl)

    return next
  }

  async verifyPasscode(passcode?: string): Promise<boolean> {
    if (!passcode) return false
    const settings = await this.getSettings()
    return settings.passcode === passcode
  }

  async createIdea(input: {
    title: string
    description: string
    format: string
    rationale?: string
    source?: string
  }) {
    const now = new Date().toISOString()
    const idea = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      format: input.format,
      rationale: input.rationale,
      source: input.source || 'agent',
      status: 'open',
      createdAt: now,
    }
    this.db.insert(communityIdeas).values(idea).run()
    return idea
  }

  async getIdeas() {
    const ideas = this.db.select().from(communityIdeas)
      .where(eq(communityIdeas.status, 'open'))
      .all()
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return ideas.map((idea: any) => {
      const votes = this.db.select().from(communityIdeaVotes).where(eq(communityIdeaVotes.ideaId, idea.id)).all()
      const upvotes = votes.filter((vote: any) => vote.value > 0).length
      const downvotes = votes.filter((vote: any) => vote.value < 0).length
      return {
        ...idea,
        upvotes,
        downvotes,
        score: upvotes - downvotes,
      }
    })
  }

  async voteOnIdea(ideaId: string, voterId: string, value: 1 | -1) {
    const now = new Date().toISOString()
    const existing = this.db.select().from(communityIdeaVotes)
      .where(and(eq(communityIdeaVotes.ideaId, ideaId), eq(communityIdeaVotes.voterId, voterId)))
      .get()

    if (existing) {
      this.db.update(communityIdeaVotes)
        .set({ value, updatedAt: now })
        .where(eq(communityIdeaVotes.id, existing.id))
        .run()
    } else {
      this.db.insert(communityIdeaVotes).values({
        id: randomUUID(),
        ideaId,
        voterId,
        value,
        createdAt: now,
        updatedAt: now,
      }).run()
    }

    return this.getIdeas()
  }

  async getPublicSnapshot() {
    const settings = await this.getSettings()
    await this.ensureIdeaSeed(5)
    const ideas = await this.getIdeas()
    const activeMembers = this.db.select().from(users)
      .where(eq(users.status, 'active'))
      .all()
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    const upcomingEvents = this.db.select().from(events)
      .where(gt(events.date, new Date().toISOString())).all()
      .filter((event: any) => ['approved', 'confirmed', 'announced'].includes(event.status))
      .sort((a: any, b: any) => a.date.localeCompare(b.date))

    return {
      community: {
        name: this.config.community.name,
        type: this.config.community.type,
        location: this.config.community.location,
        botUrl: settings.botUrl,
      },
      members: activeMembers.map((member: any) => ({
        id: member.id,
        name: member.preferredName || member.name,
        status: member.status,
        joinedAt: member.joinedAt,
      })),
      upcomingEvents,
      ideas,
    }
  }

  async getRecentIdeas(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    return this.db.select().from(communityIdeas)
      .where(gt(communityIdeas.createdAt, since))
      .all()
  }

  private async ensureDefaults() {
    await this.setSetting('public_passcode', this.config.publicPortal.passcode, true)
    await this.setSetting('public_bot_url', this.config.publicPortal.botUrl, true)
  }

  private async ensureIdeaSeed(minIdeas: number) {
    const existing = this.db.select().from(communityIdeas)
      .where(eq(communityIdeas.status, 'open'))
      .all()

    if (existing.length >= minIdeas) return

    const needed = minIdeas - existing.length
    const existingTitles = new Set(existing.map((idea: any) => String(idea.title).trim().toLowerCase()))
    const seeded = starterIdeas(this.config).filter((idea) => !existingTitles.has(idea.title.trim().toLowerCase()))

    for (const idea of seeded.slice(0, needed)) {
      await this.createIdea(idea)
    }
  }

  private async setSetting(key: string, value: string, onlyIfMissing = false) {
    const existing = this.db.select().from(communitySettings).where(eq(communitySettings.key, key)).get()
    if (existing) {
      if (onlyIfMissing) return
      this.db.update(communitySettings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(communitySettings.key, key))
        .run()
      return
    }

    this.db.insert(communitySettings).values({
      key,
      value,
      updatedAt: new Date().toISOString(),
    }).run()
  }
}

function starterIdeas(config: Config) {
  const local = config.community.type !== 'distributed'
  const location = config.community.location ? ` en ${config.community.location}` : ''

  return [
    {
      title: local ? `Cena chica${location}` : 'Remote dinner call',
      description: local
        ? 'Una cena chica para 6-8 personas donde cada uno trae qué está construyendo y qué tipo de gente quiere conocer.'
        : 'A small video dinner where members show what they are building and what they want help with.',
      format: 'dinner',
      rationale: 'Small formats generate faster trust and better matching between members.',
      source: 'seed',
    },
    {
      title: local ? `Asado de comunidad${location}` : 'Casual community call',
      description: local
        ? 'Un asado abierto para mezclar miembros nuevos con habituales y dejar que aparezcan planes paralelos.'
        : 'A low-pressure open call for members who want a lighter social touchpoint.',
      format: local ? 'bbq' : 'meetup-call',
      rationale: 'Relaxed formats surface side-topic affinities and stronger bonds.',
      source: 'seed',
    },
    {
      title: 'Topic deep dive',
      description: 'A focused conversation around one recurring topic the community keeps circling back to.',
      format: 'topic-chat',
      rationale: 'Repeated themes are usually the clearest signal of what people actually want to discuss.',
      source: 'seed',
    },
    {
      title: 'Builder podcast circle',
      description: 'A small group brings one podcast, essay, or clip and uses it as the starting point for a real discussion.',
      format: 'podcast',
      rationale: 'Shared references make it easier for people with adjacent interests to connect quickly.',
      source: 'seed',
    },
    {
      title: local ? `Outdoor walk + coffee${location}` : 'Coffee roulette pairs',
      description: local
        ? 'A walk-and-talk format for people who want easier conversations than a louder social event.'
        : 'Lightweight 1:1 or 1:2 matches for members who want a softer first interaction.',
      format: local ? 'outdoor' : 'meetup-call',
      rationale: 'Low-friction formats help quieter members participate and vote with their presence.',
      source: 'seed',
    },
  ]
}
