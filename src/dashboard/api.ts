import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventManager } from '../events/manager.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import type { ReasoningStream } from '../reasoning.js'
import type { HealthMonitor } from '../health.js'
import type { AgentCore } from '../agent/core.js'
import { users, feedback, importLog, events } from '../db/schema.js'
import { eq } from 'drizzle-orm'

interface ApiDeps {
  db: any
  eventManager: EventManager
  userMemory: UserMemory
  agentMemory: AgentMemory
  reasoning: ReasoningStream
  health: HealthMonitor
  agentCore?: AgentCore
}

export function createApiRoutes(deps: ApiDeps): Hono {
  const api = new Hono()

  // Health
  api.get('/health', (c) => {
    return c.json(deps.health.getAll())
  })

  // Overview
  api.get('/overview', async (c) => {
    const allUsers = deps.db.select().from(users).all()
    const allEvents = deps.db.select().from(events).all()
    const allFeedback = deps.db.select().from(feedback).all()
    const avgRating = allFeedback.length
      ? allFeedback.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / allFeedback.length
      : 0

    return c.json({
      members: allUsers.length,
      events: allEvents.length,
      upcomingEvents: allEvents.filter((e: any) => !['cancelled', 'completed', 'draft'].includes(e.status)).length,
      avgRating: Math.round(avgRating * 10) / 10,
    })
  })

  // Members
  api.get('/members', async (c) => {
    const allUsers = deps.db.select().from(users).all()
    const membersWithProfiles = await Promise.all(
      allUsers.map(async (user: any) => ({
        ...user,
        profile: await deps.userMemory.formatForPrompt(user.id),
      }))
    )
    return c.json(membersWithProfiles)
  })

  // Events
  api.get('/events', (c) => {
    const allEvents = deps.db.select().from(events).all()
    return c.json(allEvents)
  })

  api.get('/events/drafts', async (c) => {
    const drafts = await deps.eventManager.getDrafts()
    return c.json(drafts)
  })

  api.post('/events/:id/approve', async (c) => {
    const id = c.req.param('id')
    await deps.eventManager.approve(id)
    return c.json({ status: 'approved', id })
  })

  api.post('/events/:id/reject', async (c) => {
    const id = c.req.param('id')
    await deps.eventManager.cancel(id, 'Rejected by admin')
    return c.json({ status: 'rejected', id })
  })

  api.get('/events/:id/feedback', (c) => {
    const id = c.req.param('id')
    const eventFeedback = deps.db.select().from(feedback)
      .where(eq(feedback.eventId, id)).all()
    return c.json(eventFeedback)
  })

  // Agent files
  api.get('/agent/soul', async (c) => {
    const content = await deps.agentMemory.getSoul()
    return c.json({ content })
  })

  api.put('/agent/soul', async (c) => {
    const { content } = await c.req.json()
    await deps.agentMemory.updateSoul(content)
    return c.json({ success: true })
  })

  api.get('/agent/memory', async (c) => {
    const content = await deps.agentMemory.getMemory()
    return c.json({ content })
  })

  api.get('/agent/agent', async (c) => {
    const content = await deps.agentMemory.getAgent()
    return c.json({ content })
  })

  // Reasoning stream (SSE)
  api.get('/reasoning/stream', (c) => {
    return streamSSE(c, async (stream) => {
      // Send history first
      const history = deps.reasoning.getHistory(50)
      for (const event of history) {
        await stream.writeSSE({ data: JSON.stringify(event) })
      }

      // Stream new events
      const handler = async (event: any) => {
        try {
          await stream.writeSSE({ data: JSON.stringify(event) })
        } catch {
          deps.reasoning.removeListener('reasoning', handler)
        }
      }

      deps.reasoning.on('reasoning', handler)

      // Keep connection open
      stream.onAbort(() => {
        deps.reasoning.removeListener('reasoning', handler)
      })

      // Block until abort
      await new Promise(() => {})
    })
  })

  // Admin asks agent
  api.post('/reasoning/ask', async (c) => {
    const { question } = await c.req.json()
    if (!deps.agentCore) {
      return c.json({ error: 'Agent not initialized' }, 503)
    }
    const answer = await deps.agentCore.handleAdminQuestion(question)
    return c.json({ answer })
  })

  // Import
  api.post('/import/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (file && file instanceof File) {
      const fs = await import('fs')
      const path = await import('path')
      const inboxDir = path.default.join(process.cwd(), 'import', 'inbox')
      fs.default.mkdirSync(inboxDir, { recursive: true })
      const buffer = Buffer.from(await file.arrayBuffer())
      fs.default.writeFileSync(path.default.join(inboxDir, file.name), buffer)
      return c.json({ success: true, filename: file.name })
    }
    return c.json({ error: 'No file provided' }, 400)
  })

  api.get('/import/history', (c) => {
    const logs = deps.db.select().from(importLog).all()
    return c.json(logs)
  })

  return api
}
