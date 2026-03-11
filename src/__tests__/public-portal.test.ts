import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/index.js'
import { PublicPortal } from '../community/public-portal.js'
import { users, events } from '../db/schema.js'

describe('PublicPortal', () => {
  let db: ReturnType<typeof createDb>
  let portal: PublicPortal

  beforeEach(() => {
    db = createDb(':memory:')
    portal = new PublicPortal(db, {
      community: { name: 'Comunia', type: 'local', location: 'Buenos Aires' },
      publicPortal: { passcode: 'community-123', botUrl: 'https://t.me/comunia_bot' },
    } as any)

    db.insert(users).values({
      id: 'u1',
      name: 'Emi',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }).run()
  })

  it('seeds default public settings from config', async () => {
    const settings = await portal.getSettings()
    expect(settings.passcode).toBe('community-123')
    expect(settings.botUrl).toBe('https://t.me/comunia_bot')
  })

  it('stores ideas and aggregates votes', async () => {
    const idea = await portal.createIdea({
      title: 'Community dinner',
      description: 'A dinner to talk about projects.',
      format: 'dinner',
      rationale: 'Small groups build trust fast.',
    })

    await portal.voteOnIdea(idea.id, 'browser_a', 1)
    await portal.voteOnIdea(idea.id, 'browser_b', -1)
    await portal.voteOnIdea(idea.id, 'browser_a', 1)

    const ideas = await portal.getIdeas()
    expect(ideas).toHaveLength(1)
    expect(ideas[0].upvotes).toBe(1)
    expect(ideas[0].downvotes).toBe(1)
  })

  it('returns public snapshot with members, bot link, and upcoming events', async () => {
    db.insert(events).values({
      id: 'e1',
      title: 'Asado',
      type: 'asado',
      status: 'approved',
      proposedBy: 'u1',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      location: 'Cowork',
      createdAt: new Date().toISOString(),
    }).run()

    const snapshot = await portal.getPublicSnapshot()
    expect(snapshot.community.botUrl).toBe('https://t.me/comunia_bot')
    expect(snapshot.members).toHaveLength(1)
    expect(snapshot.upcomingEvents).toHaveLength(1)
    expect(snapshot.ideas).toHaveLength(5)
  })
})
