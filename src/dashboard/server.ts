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

interface DashboardConfig {
  port: number
  secret: string
  db: any
  eventManager: EventManager
  userMemory: UserMemory
  agentMemory: AgentMemory
  reasoning: ReasoningStream
  health: HealthMonitor
  agentCore?: AgentCore
}

export function createDashboard(config: DashboardConfig) {
  const app = new Hono()
  const publicRoot = resolveFromModule(import.meta.url, './public')

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
    agentCore: config.agentCore,
  })
  app.route('/api', api)

  // Static files
  app.use('/*', serveStatic({ root: publicRoot }))

  return {
    app,
    start: () => {
      serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
        console.log(`Dashboard running at http://127.0.0.1:${info.port}`)
      })
    },
  }
}
