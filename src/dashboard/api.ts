import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { randomUUID } from 'crypto'
import type { EventManager } from '../events/manager.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { AgentMemory } from '../memory/agent-memory.js'
import { UserProfileMemory } from '../memory/user-profile-memory.js'
import { PublicPortal } from '../community/public-portal.js'
import { CloudPublishRegistry } from '../community/cloud-publish.js'
import { GroupPolicy } from '../community/group-policy.js'
import type { ProductIdeas } from '../community/product-ideas.js'
import type { ReasoningStream } from '../reasoning.js'
import type { HealthMonitor } from '../health.js'
import type { AgentCore } from '../agent/core.js'
import { users, feedback, importLog, events } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import type { Config } from '../config.js'

interface ApiDeps {
  db: any
  eventManager: EventManager
  userMemory: UserMemory
  agentMemory: AgentMemory
  reasoning: ReasoningStream
  health: HealthMonitor
  config: Config
  agentCore?: AgentCore
  productIdeas?: ProductIdeas
}

export function createApiRoutes(deps: ApiDeps): Hono {
  const api = new Hono()
  const cloudRegistry = new CloudPublishRegistry(deps.db)
  const groupPolicy = new GroupPolicy(deps.db)

  // Health
  api.get('/health', (c) => {
    return c.json(deps.health.getAll())
  })

  api.get('/community/public-settings', async (c) => {
    const settings = await new PublicPortal(deps.db, deps.config).getSettings()
    return c.json(settings)
  })

  api.put('/community/public-settings', async (c) => {
    const body = await c.req.json()
    const settings = await new PublicPortal(deps.db, deps.config).updateSettings({
      passcode: body.passcode,
      botUrl: body.botUrl,
    })
    return c.json(settings)
  })

  api.get('/community/interaction-settings', async (c) => {
    return c.json(await groupPolicy.getSettings())
  })

  api.put('/community/interaction-settings', async (c) => {
    const body = await c.req.json()
    const settings = await groupPolicy.updateSettings({
      responseMode: body.responseMode,
      allowTelegramTopicCreation: body.allowTelegramTopicCreation,
    })
    return c.json(settings)
  })

  api.get('/cloud/publish-credentials', async (c) => {
    return c.json(await cloudRegistry.listPublishCredentials())
  })

  api.post('/cloud/publish-credentials', async (c) => {
    const body = await c.req.json()
    const slug = String(body.slug || '').trim()
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return c.json({ error: 'Slug must use lowercase letters, numbers, and hyphens only.' }, 400)
    }

    const credential = await cloudRegistry.issuePublishCredential({
      slug,
      communityName: body.communityName ? String(body.communityName) : undefined,
      regenerate: body.regenerate === true,
    })
    return c.json(credential)
  })

  api.get('/cloud/status', async (c) => {
    return c.json({
      serverEnabled: deps.config.cloud?.serverEnabled === true,
      publishUrl: deps.config.cloud?.publishUrl || '',
    })
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
    const profileMemory = new UserProfileMemory(deps.db, deps.userMemory, deps.agentMemory)
    const membersWithProfiles = await Promise.all(
      allUsers.map(async (user: any) => ({
        ...user,
        profile: await deps.userMemory.formatForPrompt(user.id),
        memoryFilePath: (await profileMemory.sync(user.id)).path,
      }))
    )
    return c.json(membersWithProfiles)
  })

  api.get('/members/:id/memory', async (c) => {
    const id = c.req.param('id')
    const profileMemory = new UserProfileMemory(deps.db, deps.userMemory, deps.agentMemory)
    const { content, path } = await profileMemory.sync(id)
    return c.json({ content, path })
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

  api.get('/events/proposals', async (c) => {
    const proposals = await deps.eventManager.getProposals()
    return c.json(proposals)
  })

  api.get('/product-ideas', async (c) => {
    if (!deps.productIdeas) {
      return c.json({ error: 'Product ideas are unavailable in this runtime.' }, 503)
    }

    return c.json(await deps.productIdeas.getDashboardState())
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

  api.put('/agent/memory', async (c) => {
    const { content } = await c.req.json()
    await deps.agentMemory.updateMemory(content)
    return c.json({ success: true })
  })

  api.get('/agent/agent', async (c) => {
    const content = await deps.agentMemory.getAgent()
    return c.json({ content })
  })

  api.put('/agent/agent', async (c) => {
    const { content } = await c.req.json()
    await deps.agentMemory.updateAgent(content)
    return c.json({ success: true })
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
      const now = new Date().toISOString()
      deps.db.insert(importLog).values({
        id: randomUUID(),
        sourceFile: file.name,
        type: 'uploaded',
        status: 'uploaded',
        error: null,
        messagesProcessed: 0,
        membersProcessed: 0,
        entriesExtracted: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        importedAt: now,
      }).run()
      return c.json({ success: true, filename: file.name })
    }
    return c.json({ error: 'No file provided' }, 400)
  })

  api.get('/import/history', (c) => {
    const logs = deps.db.select().from(importLog).orderBy(desc(importLog.createdAt)).all()
    return c.json(logs)
  })

  return api
}
