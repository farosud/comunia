import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudSyncClient } from '../community/cloud-sync.js'
import type { Config } from '../config.js'

describe('CloudSyncClient', () => {
  let config: Config
  let portal: {
    getPublicSnapshot: ReturnType<typeof vi.fn>
    getSettings: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    config = {
      llm: {
        provider: 'claude',
        anthropicApiKey: '',
        openaiApiKey: '',
        openrouterApiKey: '',
        openrouterModel: 'anthropic/claude-sonnet-4',
        ollamaUrl: '',
        maxConcurrent: 10,
        maxPerMinute: 30,
      },
      telegram: { enabled: false, botToken: '', groupChatId: '' },
      whatsapp: {
        enabled: false,
        provider: 'cloud_api',
        cloudApiToken: '',
        phoneNumberId: '',
        verifyToken: '',
        groupId: '',
      },
      community: {
        name: 'Founders BA',
        language: 'en',
        type: 'local',
        location: 'Buenos Aires',
        adminUserIds: [],
      },
      scheduler: {
        reminderHoursBefore: [48, 2],
        feedbackDelayHours: 24,
        digestCron: '0 10 * * 1',
        reflectionCron: '0 3 * * *',
        venueResearchCron: '0 9 * * 3',
        eventIdeationCron: '0 10 * * 1',
        subgroupAnalysisCron: '0 4 * * 0',
        memberSyncCron: '*/15 * * * *',
        communityIdeaCron: '0 */8 * * *',
      },
      dashboard: {
        host: '127.0.0.1',
        port: 3000,
        secret: 'secret',
      },
      database: {
        path: './data/comunia.db',
      },
      publicPortal: {
        mode: 'cloud',
        passcode: 'community-123',
        botUrl: 'https://t.me/founders_bot',
      },
      cloud: {
        publishUrl: 'https://cloud.comunia.chat',
        publishSlug: 'founders-ba',
        publishToken: 'token',
        serverEnabled: false,
        serverToken: '',
        syncIntervalMs: 15000,
      },
    }

    portal = {
      getPublicSnapshot: vi.fn(async () => ({
        community: { name: 'Founders BA' },
        members: [{ id: 'u1', name: 'Emi' }],
        upcomingEvents: [],
        ideas: [],
      })),
      getSettings: vi.fn(async () => ({
        passcode: 'community-123',
        botUrl: 'https://t.me/founders_bot',
      })),
    }
  })

  it('publishes on first sync and skips unchanged payloads', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const client = new CloudSyncClient({ config, portal: portal as any, fetchImpl })

    expect(await client.syncNow()).toBe(true)
    expect(await client.syncNow()).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('publishes again after the public snapshot changes', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const client = new CloudSyncClient({ config, portal: portal as any, fetchImpl })

    await client.syncNow()
    portal.getPublicSnapshot.mockResolvedValueOnce({
      community: { name: 'Founders BA' },
      members: [{ id: 'u1', name: 'Emi' }, { id: 'u2', name: 'Pato' }],
      upcomingEvents: [],
      ideas: [],
    })

    expect(await client.syncNow()).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
