import { loadConfig } from './config.js'
import { createDb } from './db/index.js'
import { TelegramBridge } from './bridges/telegram.js'
import { WhatsAppCloudBridge } from './bridges/whatsapp-cloud.js'
import { createProvider } from './agent/providers/types.js'
import { AgentMemory } from './memory/agent-memory.js'
import { UserMemory } from './memory/user-memory.js'
import { EventManager } from './events/manager.js'
import { AgentCore } from './agent/core.js'
import { MessageRouter } from './router/index.js'
import { ReasoningStream } from './reasoning.js'
import { HealthMonitor } from './health.js'
import { Scheduler } from './scheduler/index.js'
import { ImportAnalyzer } from './import/analyzer.js'
import { ImportSeeder } from './import/seeder.js'
import { ImportWatcher } from './import/watcher.js'
import { createDashboard } from './dashboard/server.js'
import { SmartTargeting } from './events/targeting.js'
import PQueue from 'p-queue'
import path from 'path'
import fs from 'fs'
import type { Bridge, InboundMessage } from './bridges/types.js'

async function runWithRestart(name: string, fn: () => Promise<void>, health: HealthMonitor) {
  while (true) {
    try {
      health.update(name, 'connected')
      await fn()
    } catch (err) {
      health.update(name, 'error', String(err))
      console.error(`[${name}] crashed, restarting in 5s...`, err)
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}

async function main() {
  const config = loadConfig()
  const db = createDb()
  const health = new HealthMonitor()
  const reasoning = new ReasoningStream()

  console.log(`🦞 comunia v0.1.0`)
  console.log(`Community: ${config.community.name}`)

  // Agent files — copy templates if not present
  const agentDir = path.join(process.cwd(), 'agent')
  fs.mkdirSync(agentDir, { recursive: true })

  for (const file of ['soul.md', 'memory.md', 'agent.md']) {
    const dest = path.join(agentDir, file)
    const tmpl = path.join(process.cwd(), 'templates', file.replace('.md', '.example.md'))
    if (!fs.existsSync(dest) && fs.existsSync(tmpl)) {
      fs.copyFileSync(tmpl, dest)
      console.log(`  Created agent/${file} from template`)
    }
  }

  // Core services
  const llm = createProvider(config.llm)
  const agentMemory = new AgentMemory(agentDir)
  const userMemory = new UserMemory(db)
  const eventManager = new EventManager(db)

  // Rate-limited LLM queue
  const llmQueue = new PQueue({ concurrency: config.llm.maxConcurrent })

  // Messaging functions
  const bridges: Bridge[] = []

  const sendDm = async (userId: string, message: string) => {
    for (const bridge of bridges) {
      try {
        await bridge.sendMessage({ chatId: userId, text: message })
      } catch {}
    }
  }

  const sendGroup = async (message: string) => {
    for (const bridge of bridges) {
      const groupId = bridge.platform === 'telegram'
        ? config.telegram.groupChatId
        : config.whatsapp.groupId
      if (groupId) {
        try {
          await bridge.sendMessage({ chatId: groupId, text: message })
        } catch {}
      }
    }
  }

  // Agent core
  const agentCore = new AgentCore({
    llm, agentMemory, userMemory, eventManager, reasoning, config, sendDm, sendGroup, db,
  })

  // Smart targeting
  const targeting = new SmartTargeting(llm, eventManager, userMemory, reasoning, sendDm, db)

  // Router
  const router = new MessageRouter(
    db,
    config.community.adminUserIds,
    (msg) => llmQueue.add(() => agentCore.handleMessage(msg)) as Promise<string>,
    (cmd, msg) => llmQueue.add(() => agentCore.handleAdminQuestion(cmd)) as Promise<string>,
  )

  // Message handler for bridges
  const handleMessage = async (msg: InboundMessage) => {
    try {
      const response = await router.route(msg)
      if (response) {
        const bridge = bridges.find(b => b.platform === msg.platform)
        if (bridge) {
          await bridge.sendMessage({ chatId: msg.chatId, text: response })
        }
      }
    } catch (err) {
      console.error(`[${msg.platform}] message handling error:`, err)
    }
  }

  // Telegram bridge
  if (config.telegram.enabled && config.telegram.botToken) {
    const telegram = new TelegramBridge({
      botToken: config.telegram.botToken,
      groupChatId: config.telegram.groupChatId || '',
    })
    telegram.onMessage(handleMessage)
    bridges.push(telegram)
    runWithRestart('telegram', () => telegram.start(), health)
  }

  // WhatsApp Cloud API bridge
  if (config.whatsapp.enabled && config.whatsapp.cloudApiToken) {
    const whatsapp = new WhatsAppCloudBridge({
      cloudApiToken: config.whatsapp.cloudApiToken,
      phoneNumberId: config.whatsapp.phoneNumberId || '',
      verifyToken: config.whatsapp.verifyToken || '',
      groupId: config.whatsapp.groupId || '',
    })
    whatsapp.onMessage(handleMessage)
    bridges.push(whatsapp)
    health.update('whatsapp', 'connected')
  }

  // Scheduler (all 9 jobs are registered inside the Scheduler constructor)
  const scheduler = new Scheduler(config)
  const jobCtx = {
    llm, eventManager, userMemory, agentMemory, reasoning, config, sendDm, sendGroup, db,
    reason: (jobName: string, level: string, message: string, data?: Record<string, unknown>) => {
      reasoning.emit_reasoning({ jobName, level: level as any, message, data })
    },
  }
  runWithRestart('scheduler', () => scheduler.start(jobCtx), health)

  // Dashboard
  const dashboard = createDashboard({
    port: config.dashboard.port,
    secret: config.dashboard.secret,
    db, eventManager, userMemory, agentMemory, reasoning, health, agentCore,
  })

  // Mount WhatsApp webhook routes on dashboard server if WhatsApp is enabled
  if (config.whatsapp.enabled) {
    const wa = bridges.find(b => b.platform === 'whatsapp') as WhatsAppCloudBridge | undefined
    if (wa) {
      dashboard.app.get('/webhook/whatsapp', (c) => {
        try {
          const challenge = wa.verifyWebhook(
            Object.fromEntries(new URL(c.req.url, 'http://localhost').searchParams),
          )
          return c.text(challenge)
        } catch {
          return c.text('Forbidden', 403)
        }
      })
      dashboard.app.post('/webhook/whatsapp', async (c) => {
        const body = await c.req.json()
        await wa.handleIncoming(body)
        return c.text('OK')
      })
    }
  }

  dashboard.start()
  health.update('dashboard', 'connected')

  // Import watcher
  const inboxDir = path.join(process.cwd(), 'import', 'inbox')
  const processedDir = path.join(process.cwd(), 'import', 'processed')
  const analyzer = new ImportAnalyzer(llm, reasoning)
  const seeder = new ImportSeeder(db, userMemory, agentMemory)
  const watcher = new ImportWatcher(inboxDir, processedDir, analyzer, seeder, reasoning)
  runWithRestart('import-watcher', () => watcher.start(), health)

  console.log(`\n✓ All systems ready`)
  console.log(`  Dashboard: http://127.0.0.1:${config.dashboard.port}`)
}

main().catch(console.error)
