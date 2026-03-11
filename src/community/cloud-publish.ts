import { randomBytes, randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { cloudPublishCredentials, publishedIdeaVotes, publishedPortals } from '../db/schema.js'

type Db = any

interface PublishedPortalRecord {
  slug: string
  communityName: string
  snapshot: string
  passcode: string
  botUrl?: string
  publishedAt: string
  updatedAt: string
}

export class CloudPublishRegistry {
  constructor(private db: Db) {}

  async listPublishCredentials() {
    return this.db.select().from(cloudPublishCredentials).all()
      .sort((a: any, b: any) => a.slug.localeCompare(b.slug))
      .map((row: any) => ({
        slug: row.slug,
        communityName: row.communityName || '',
        tokenPreview: maskToken(row.token),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
  }

  async issuePublishCredential(input: {
    slug: string
    communityName?: string
    regenerate?: boolean
  }) {
    const now = new Date().toISOString()
    const existing = this.db.select().from(cloudPublishCredentials)
      .where(eq(cloudPublishCredentials.slug, input.slug))
      .get()

    if (existing && !input.regenerate) {
      return {
        slug: existing.slug,
        token: existing.token,
        communityName: existing.communityName || '',
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      }
    }

    const token = createPublishToken()
    const payload = {
      slug: input.slug,
      token,
      communityName: input.communityName || existing?.communityName || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }

    if (existing) {
      this.db.update(cloudPublishCredentials)
        .set(payload)
        .where(eq(cloudPublishCredentials.slug, input.slug))
        .run()
    } else {
      this.db.insert(cloudPublishCredentials).values(payload).run()
    }

    return {
      slug: payload.slug,
      token: payload.token,
      communityName: payload.communityName || '',
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    }
  }

  async claimPublishCredential(input: {
    slug: string
    communityName?: string
  }) {
    const existingCredential = this.db.select().from(cloudPublishCredentials)
      .where(eq(cloudPublishCredentials.slug, input.slug))
      .get()
    if (existingCredential) {
      throw new Error('Slug already registered')
    }

    const existingPortal = this.db.select().from(publishedPortals)
      .where(eq(publishedPortals.slug, input.slug))
      .get()
    if (existingPortal) {
      throw new Error('Slug already published')
    }

    return this.issuePublishCredential({
      slug: input.slug,
      communityName: input.communityName,
      regenerate: false,
    })
  }

  async verifyPublishToken(slug: string, token?: string): Promise<boolean> {
    if (!token) return false
    const record = this.db.select().from(cloudPublishCredentials)
      .where(eq(cloudPublishCredentials.slug, slug))
      .get()
    return Boolean(record && record.token === token)
  }

  async publish(input: {
    slug: string
    communityName: string
    snapshot: Record<string, unknown>
    passcode: string
    botUrl?: string
  }) {
    const now = new Date().toISOString()
    const existing = this.db.select().from(publishedPortals).where(eq(publishedPortals.slug, input.slug)).get()
    const payload: PublishedPortalRecord = {
      slug: input.slug,
      communityName: input.communityName,
      snapshot: JSON.stringify(input.snapshot),
      passcode: input.passcode,
      botUrl: input.botUrl,
      publishedAt: existing?.publishedAt || now,
      updatedAt: now,
    }

    if (existing) {
      this.db.update(publishedPortals)
        .set(payload)
        .where(eq(publishedPortals.slug, input.slug))
        .run()
    } else {
      this.db.insert(publishedPortals).values(payload).run()
    }

    return payload
  }

  async verifyPasscode(slug: string, passcode?: string): Promise<boolean> {
    if (!passcode) return false
    const record = this.db.select().from(publishedPortals).where(eq(publishedPortals.slug, slug)).get()
    return Boolean(record && record.passcode === passcode)
  }

  async getPortal(slug: string) {
    const record = this.db.select().from(publishedPortals).where(eq(publishedPortals.slug, slug)).get()
    if (!record) return undefined

    const snapshot = JSON.parse(record.snapshot)
    const ideas = Array.isArray((snapshot as any).ideas) ? (snapshot as any).ideas : []

    const enrichedIdeas = ideas.map((idea: any) => {
      const votes = this.db.select().from(publishedIdeaVotes)
        .where(and(eq(publishedIdeaVotes.slug, slug), eq(publishedIdeaVotes.ideaId, String(idea.id))))
        .all()
      const upvotes = votes.filter((vote: any) => vote.value > 0).length
      const downvotes = votes.filter((vote: any) => vote.value < 0).length
      return {
        ...idea,
        upvotes,
        downvotes,
        score: upvotes - downvotes,
      }
    })

    return {
      ...snapshot,
      community: {
        ...(snapshot as any).community,
        botUrl: record.botUrl || (snapshot as any).community?.botUrl || '',
      },
      ideas: enrichedIdeas,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
    }
  }

  async voteOnIdea(slug: string, ideaId: string, voterId: string, value: 1 | -1) {
    const now = new Date().toISOString()
    const existing = this.db.select().from(publishedIdeaVotes)
      .where(and(
        eq(publishedIdeaVotes.slug, slug),
        eq(publishedIdeaVotes.ideaId, ideaId),
        eq(publishedIdeaVotes.voterId, voterId),
      ))
      .get()

    if (existing) {
      this.db.update(publishedIdeaVotes)
        .set({ value, updatedAt: now })
        .where(eq(publishedIdeaVotes.id, existing.id))
        .run()
    } else {
      this.db.insert(publishedIdeaVotes).values({
        id: randomUUID(),
        slug,
        ideaId,
        voterId,
        value,
        createdAt: now,
        updatedAt: now,
      }).run()
    }

    return this.getPortal(slug)
  }
}

function createPublishToken(): string {
  return `cp_${randomBytes(24).toString('hex')}`
}

function maskToken(value: string): string {
  if (!value) return ''
  if (value.length <= 10) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}
