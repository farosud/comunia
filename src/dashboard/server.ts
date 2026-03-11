import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApiRoutes } from './api.js'
import { resolveFromModule } from '../runtime-paths.js'
import type { EventManager } from '../events/manager.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import type { ReasoningStream } from '../reasoning.js'
import type { HealthMonitor } from '../health.js'
import type { AgentCore } from '../agent/core.js'
import type { Config } from '../config.js'
import { PublicPortal } from '../community/public-portal.js'
import { CloudPublishRegistry } from '../community/cloud-publish.js'

interface DashboardConfig {
  port: number
  secret: string
  db: any
  eventManager: EventManager
  userMemory: UserMemory
  agentMemory: AgentMemory
  reasoning: ReasoningStream
  health: HealthMonitor
  config: Config
  agentCore?: AgentCore
}

export function createDashboard(config: DashboardConfig) {
  const app = new Hono()
  const publicRoot = resolveFromModule(import.meta.url, './public')
  const publicPortal = new PublicPortal(config.db, config.config)
  const cloudRegistry = new CloudPublishRegistry(config.db)
  const cloudSubscribers = new Map<string, Set<(portal: any) => void>>()

  const broadcastCloudPortal = (slug: string, portal: any) => {
    const listeners = cloudSubscribers.get(slug)
    if (!listeners?.size) return
    for (const listener of listeners) listener(portal)
  }

  const subscribeCloudPortal = (slug: string, listener: (portal: any) => void) => {
    const listeners = cloudSubscribers.get(slug) || new Set<(portal: any) => void>()
    listeners.add(listener)
    cloudSubscribers.set(slug, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) cloudSubscribers.delete(slug)
    }
  }

  // Auth middleware for API routes
  app.use('/api/*', async (c, next) => {
    // Allow SSE without auth header check for EventSource (uses query param)
    if (c.req.path === '/api/reasoning/stream') {
      const token = c.req.query('token')
      if (token === config.secret) {
        await next()
        return
      }
    }

    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${config.secret}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  // Mount API routes
  const api = createApiRoutes({
    db: config.db,
    eventManager: config.eventManager,
    userMemory: config.userMemory,
    agentMemory: config.agentMemory,
    reasoning: config.reasoning,
    health: config.health,
    config: config.config,
    agentCore: config.agentCore,
  })
  app.route('/api', api)

  app.get('/community', (c) => c.redirect('/community.html'))

  app.post('/community-api/unlock', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const ok = await publicPortal.verifyPasscode(body.passcode)
    return c.json({ ok }, ok ? 200 : 401)
  })

  app.use('/community-api/*', async (c, next) => {
    const passcode = c.req.header('x-community-code') || c.req.query('code') || ''
    const ok = await publicPortal.verifyPasscode(passcode)
    if (!ok) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  app.get('/community-api/bootstrap', async (c) => {
    return c.json(await publicPortal.getPublicSnapshot())
  })

  app.post('/community-api/ideas/:id/vote', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json()
    const ideas = await publicPortal.voteOnIdea(id, String(body.voterId || ''), body.value === -1 ? -1 : 1)
    return c.json({ ideas })
  })

  if (config.config.cloud.serverEnabled) {
    app.post('/cloud-api/register', async (c) => {
      const body = await c.req.json().catch(() => ({}))
      const slug = String(body.slug || '').trim()
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return c.json({ error: 'Slug must use lowercase letters, numbers, and hyphens only.' }, 400)
      }

      try {
        const credential = await cloudRegistry.claimPublishCredential({
          slug,
          communityName: body.communityName ? String(body.communityName) : undefined,
        })
        return c.json({
          slug: credential.slug,
          token: credential.token,
          publicUrl: `${c.req.url.replace(/\/cloud-api\/register$/, '')}/${credential.slug}`,
        }, 201)
      } catch (error) {
        return c.json({ error: String(error instanceof Error ? error.message : error) }, 409)
      }
    })

    app.post('/cloud-api/publish/:slug', async (c) => {
      const token = c.req.header('x-cloud-publish-token') || ''
      const slug = c.req.param('slug')
      const hasPerCommunityToken = await cloudRegistry.verifyPublishToken(slug, token)
      const hasFallbackToken = Boolean(config.config.cloud.serverToken) && token === config.config.cloud.serverToken
      if (!hasPerCommunityToken && !hasFallbackToken) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const body = await c.req.json()
      const record = await cloudRegistry.publish({
        slug,
        communityName: String(body.communityName || slug),
        snapshot: body.snapshot || {},
        passcode: String(body.passcode || ''),
        botUrl: body.botUrl ? String(body.botUrl) : undefined,
      })
      const portal = await cloudRegistry.getPortal(slug)
      if (portal) broadcastCloudPortal(slug, portal)
      return c.json({
        slug: record.slug,
        updatedAt: record.updatedAt,
        publicUrl: `${c.req.url.replace(/\/cloud-api\/publish\/.+$/, '')}/${record.slug}`,
      })
    })

    app.post('/cloud-api/unlock/:slug', async (c) => {
      const slug = c.req.param('slug')
      const body = await c.req.json().catch(() => ({}))
      const ok = await cloudRegistry.verifyPasscode(slug, body.passcode)
      return c.json({ ok }, ok ? 200 : 401)
    })

    app.use('/cloud-api/communities/:slug/*', async (c, next) => {
      const slug = c.req.param('slug')
      const passcode = c.req.header('x-community-code') || c.req.query('code') || ''
      const ok = await cloudRegistry.verifyPasscode(slug, passcode)
      if (!ok) return c.json({ error: 'Unauthorized' }, 401)
      await next()
    })

    app.get('/cloud-api/communities/:slug/bootstrap', async (c) => {
      const portal = await cloudRegistry.getPortal(c.req.param('slug'))
      if (!portal) return c.json({ error: 'Not found' }, 404)
      return c.json(portal)
    })

    app.get('/cloud-api/communities/:slug/stream', async (c) => {
      const slug = c.req.param('slug')
      const portal = await cloudRegistry.getPortal(slug)
      if (!portal) return c.json({ error: 'Not found' }, 404)

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          const send = (nextPortal: any) => {
            controller.enqueue(encoder.encode(`event: portal\ndata: ${JSON.stringify(nextPortal)}\n\n`))
          }

          send(portal)
          const unsubscribe = subscribeCloudPortal(slug, send)
          const heartbeat = setInterval(() => {
            controller.enqueue(encoder.encode(': heartbeat\n\n'))
          }, 15000)

          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(heartbeat)
            unsubscribe()
            controller.close()
          }, { once: true })
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    })

    app.post('/cloud-api/communities/:slug/ideas/:id/vote', async (c) => {
      const slug = c.req.param('slug')
      const ideaId = c.req.param('id')
      const body = await c.req.json()
      const portal = await cloudRegistry.voteOnIdea(slug, ideaId, String(body.voterId || ''), body.value === -1 ? -1 : 1)
      if (portal) broadcastCloudPortal(slug, portal)
      return c.json({ portal })
    })

    app.get('/:slug', async (c, next) => {
      const slug = c.req.param('slug')
      if (slug.includes('.')) return next()
      const portal = await cloudRegistry.getPortal(slug)
      if (!portal) return next()

      return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(String((portal as any).community?.name || slug))} | Comunia</title>
  <link rel="stylesheet" href="/community.css">
</head>
<body>
  <script>window.COMUNIA_PUBLISHED_SLUG = ${JSON.stringify(slug)};</script>
  <div id="published-community-root"></div>
  <script src="/published-community.js"></script>
</body>
</html>`)
    })
  }

  // Static files
  app.use('/*', serveStatic({ root: publicRoot }))

  return {
    app,
    start: () => {
      serve({ fetch: app.fetch, port: config.port, hostname: config.config.dashboard.host }, (info) => {
        console.log(`Dashboard running at http://${config.config.dashboard.host}:${info.port}`)
      })
    },
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
