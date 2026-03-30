import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createDb } from '../db/index.js'
import { createDashboard } from '../dashboard/server.js'
import { EventManager } from '../events/manager.js'
import { UserMemory } from '../memory/user-memory.js'
import { AgentMemory } from '../memory/agent-memory.js'
import { ReasoningStream } from '../reasoning.js'
import { HealthMonitor } from '../health.js'

describe('Dashboard server', () => {
  let db: ReturnType<typeof createDb>
  let tmpDir: string

  beforeEach(() => {
    db = createDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-dashboard-server-'))
    fs.writeFileSync(path.join(tmpDir, 'soul.md'), '# Soul\nTest soul.')
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), '# Memory\nTest memory.')
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent\nTest agent.')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('GET /r/:subreddit renders an html page with comunia product ideas', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/about.json')) {
        return new Response(JSON.stringify({
          data: {
            title: 'The Good Place',
            public_description: 'A place to discuss ethics, episodes, and characters.',
            subscribers: 123456,
            active_user_count: 321,
            over18: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'post-1',
                title: 'What would your points score be?',
                author: 'michael',
                score: 900,
                num_comments: 85,
                link_flair_text: 'discussion',
                selftext: 'People keep proposing ethics games and quizzes.',
                permalink: '/r/TheGoodPlace/comments/post-1/points_score/',
              },
            },
          ],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const analyzeExternalSignals = vi.fn().mockResolvedValue({
      signalSummary: 'Subreddit: r/TheGoodPlace\nTop posts:\n- What would your points score be?',
      ideas: [
        {
          title: 'Ethics challenge generator',
          summary: 'Turns episode debates into interactive prompts.',
          targetMembers: 'Fans who like structured games',
          rationale: 'The subreddit repeatedly proposes ethics quizzes and scorekeeping.',
          buildPrompt: 'Build an ethics challenge generator MVP.',
        },
      ],
    })

    const dashboard = createDashboard({
      port: 3000,
      secret: 'test-secret',
      db,
      eventManager: new EventManager(db),
      userMemory: new UserMemory(db),
      agentMemory: new AgentMemory(tmpDir),
      reasoning: new ReasoningStream(),
      health: new HealthMonitor(),
      config: {
        community: { name: 'Comunia', type: 'local', location: 'Buenos Aires' },
        publicPortal: { passcode: 'community-123', botUrl: '' },
        cloud: { serverEnabled: false },
      } as any,
      productIdeas: {
        analyzeExternalSignals,
      } as any,
    })

    const res = await dashboard.app.request('http://localhost/r/TheGoodPlace')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()

    expect(html).toContain('The Good Place')
    expect(html).toContain('Ethics challenge generator')
    expect(html).toContain('/r/TheGoodPlace.json')
    expect(html).toContain('10 potential product ideas this community would enjoy')
    expect(html).not.toContain('Why these ideas')
    expect(html).not.toContain('What people are already reacting to')
    expect(analyzeExternalSignals).toHaveBeenCalledWith(expect.objectContaining({ count: 10 }))
  })

  it('GET /r/:subreddit.json returns the machine-readable payload', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/about.json')) {
        return new Response(JSON.stringify({
          data: {
            title: 'The Good Place',
            public_description: 'A place to discuss ethics, episodes, and characters.',
            subscribers: 123456,
            active_user_count: 321,
            over18: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'post-1',
                title: 'What would your points score be?',
                author: 'michael',
                score: 900,
                num_comments: 85,
                link_flair_text: 'discussion',
                selftext: 'People keep proposing ethics games and quizzes.',
                permalink: '/r/TheGoodPlace/comments/post-1/points_score/',
              },
            },
          ],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const dashboard = createDashboard({
      port: 3000,
      secret: 'test-secret',
      db,
      eventManager: new EventManager(db),
      userMemory: new UserMemory(db),
      agentMemory: new AgentMemory(tmpDir),
      reasoning: new ReasoningStream(),
      health: new HealthMonitor(),
      config: {
        community: { name: 'Comunia', type: 'local', location: 'Buenos Aires' },
        publicPortal: { passcode: 'community-123', botUrl: '' },
        cloud: { serverEnabled: false },
      } as any,
      productIdeas: {
        analyzeExternalSignals: vi.fn().mockResolvedValue({
          signalSummary: 'Subreddit: r/TheGoodPlace\nTop posts:\n- What would your points score be?',
          ideas: [
            {
              title: 'Ethics challenge generator',
              summary: 'Turns episode debates into interactive prompts.',
              buildPrompt: 'Build an ethics challenge generator MVP.',
            },
          ],
        }),
      } as any,
    })

    const res = await dashboard.app.request('http://localhost/r/TheGoodPlace.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const data = await res.json()

    expect(data.source.redditJsonUrl).toContain('/r/TheGoodPlace.json')
    expect(data.subreddit.title).toBe('The Good Place')
    expect(data.highlights.posts).toHaveLength(1)
    expect(data.comunia.ideas[0].title).toBe('Ethics challenge generator')
    expect(data.redditJson.data.children[0].data.title).toBe('What would your points score be?')
  })

  it('GET /r/:subreddit renders a branded error page when reddit blocks the request', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/about.json')) {
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response('blocked', { status: 403 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const dashboard = createDashboard({
      port: 3000,
      secret: 'test-secret',
      db,
      eventManager: new EventManager(db),
      userMemory: new UserMemory(db),
      agentMemory: new AgentMemory(tmpDir),
      reasoning: new ReasoningStream(),
      health: new HealthMonitor(),
      config: {
        community: { name: 'Comunia', type: 'local', location: 'Buenos Aires' },
        publicPortal: { passcode: 'community-123', botUrl: '' },
        cloud: { serverEnabled: false },
      } as any,
      productIdeas: {
        analyzeExternalSignals: vi.fn(),
      } as any,
    })

    const res = await dashboard.app.request('http://localhost/r/TheGoodPlace')
    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('We could not fetch this subreddit right now')
    expect(html).toContain('Reddit blocked the upstream JSON request from this server.')
  })

  it('GET /r/:subreddit.json returns a fast json error when reddit blocks the request', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/about.json')) {
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response('blocked', { status: 403 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const dashboard = createDashboard({
      port: 3000,
      secret: 'test-secret',
      db,
      eventManager: new EventManager(db),
      userMemory: new UserMemory(db),
      agentMemory: new AgentMemory(tmpDir),
      reasoning: new ReasoningStream(),
      health: new HealthMonitor(),
      config: {
        community: { name: 'Comunia', type: 'local', location: 'Buenos Aires' },
        publicPortal: { passcode: 'community-123', botUrl: '' },
        cloud: { serverEnabled: false },
      } as any,
      productIdeas: {
        analyzeExternalSignals: vi.fn(),
      } as any,
    })

    const res = await dashboard.app.request('http://localhost/r/TheGoodPlace.json')
    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).toContain('application/json')
    const data = await res.json()
    expect(data.error).toContain('Reddit blocked the upstream JSON request from this server.')
    expect(data.status).toBe(403)
  })
})
