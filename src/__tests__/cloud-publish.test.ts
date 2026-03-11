import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/index.js'
import { CloudPublishRegistry } from '../community/cloud-publish.js'

describe('CloudPublishRegistry', () => {
  let db: ReturnType<typeof createDb>
  let registry: CloudPublishRegistry

  beforeEach(() => {
    db = createDb(':memory:')
    registry = new CloudPublishRegistry(db)
  })

  it('stores and returns a published portal snapshot', async () => {
    await registry.publish({
      slug: 'founders-ba',
      communityName: 'Founders BA',
      passcode: 'community-123',
      botUrl: 'https://t.me/founders_bot',
      snapshot: {
        community: { name: 'Founders BA', botUrl: 'https://t.me/founders_bot' },
        members: [{ id: 'u1', name: 'Emi' }],
        upcomingEvents: [],
        ideas: [{ id: 'idea-1', title: 'Dinner', description: 'Small dinner', format: 'dinner' }],
      },
    })

    const portal = await registry.getPortal('founders-ba')
    expect(portal?.community.name).toBe('Founders BA')
    expect(portal?.ideas).toHaveLength(1)
  })

  it('verifies passcode and aggregates votes per published idea', async () => {
    await registry.publish({
      slug: 'founders-ba',
      communityName: 'Founders BA',
      passcode: 'community-123',
      snapshot: {
        community: { name: 'Founders BA' },
        members: [],
        upcomingEvents: [],
        ideas: [{ id: 'idea-1', title: 'Dinner', description: 'Small dinner', format: 'dinner' }],
      },
    })

    expect(await registry.verifyPasscode('founders-ba', 'community-123')).toBe(true)
    expect(await registry.verifyPasscode('founders-ba', 'bad')).toBe(false)

    const portal = await registry.voteOnIdea('founders-ba', 'idea-1', 'browser_a', 1)
    expect(portal?.ideas[0].upvotes).toBe(1)
  })

  it('issues per-community publish credentials and verifies by slug', async () => {
    const credential = await registry.issuePublishCredential({
      slug: 'founders-ba',
      communityName: 'Founders BA',
    })

    expect(credential.slug).toBe('founders-ba')
    expect(credential.token.startsWith('cp_')).toBe(true)
    expect(await registry.verifyPublishToken('founders-ba', credential.token)).toBe(true)
    expect(await registry.verifyPublishToken('other-community', credential.token)).toBe(false)

    const listed = await registry.listPublishCredentials()
    expect(listed).toHaveLength(1)
    expect(listed[0].slug).toBe('founders-ba')
    expect(listed[0].tokenPreview).toContain('...')
  })

  it('claims an unused slug only once', async () => {
    const first = await registry.claimPublishCredential({
      slug: 'builders-nyc',
      communityName: 'Builders NYC',
    })
    expect(first.slug).toBe('builders-nyc')

    await expect(registry.claimPublishCredential({
      slug: 'builders-nyc',
      communityName: 'Builders NYC',
    })).rejects.toThrow('Slug already registered')
  })
})
