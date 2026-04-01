import { loadConfig } from './config.js'
import { createDb } from './db/index.js'
import { TelegramBridge, type TelegramChatInfo, type TelegramMemberProfile } from './bridges/telegram.js'
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
import { resolveFromModule } from './runtime-paths.js'
import { TelegramMemberSync } from './members/telegram-sync.js'
import { PublicPortal } from './community/public-portal.js'
import { CloudSyncClient } from './community/cloud-sync.js'
import { GroupPolicy } from './community/group-policy.js'
import { ProductIdeas } from './community/product-ideas.js'
import { CommunitySiteGenerator } from './community/site-generator.js'
import { TelegramEventsTopicStore } from './community/telegram-events-topic.js'
import PQueue from 'p-queue'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import type { Bridge, InboundMessage } from './bridges/types.js'
import { users } from './db/schema.js'
import { eq, or } from 'drizzle-orm'

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

export async function startApp() {
  const config = loadConfig()
  const db = createDb(config.database.path)
  const health = new HealthMonitor()
  const reasoning = new ReasoningStream()
  const templatesDir = resolveFromModule(import.meta.url, '../templates')

  console.log(`🦞 comunia v0.1.0`)
  console.log(`Community: ${config.community.name}`)

  // Agent files — copy templates if not present
  const agentDir = path.join(process.cwd(), 'agent')
  fs.mkdirSync(agentDir, { recursive: true })

  for (const file of ['soul.md', 'memory.md', 'agent.md']) {
    const dest = path.join(agentDir, file)
    const tmpl = path.join(templatesDir, file.replace('.md', '.example.md'))
    if (!fs.existsSync(dest) && fs.existsSync(tmpl)) {
      fs.copyFileSync(tmpl, dest)
      console.log(`  Created agent/${file} from template`)
    }
  }

  // Core services
  const agentMemory = new AgentMemory(agentDir)
  const userMemory = new UserMemory(db)
  const eventManager = new EventManager(db)
  const publicPortal = new PublicPortal(db, config)
  const groupPolicy = new GroupPolicy(db)
  const telegramEventsTopic = new TelegramEventsTopicStore(db)
  const cloudOnlyMode = config.cloud.serverEnabled
    && !config.telegram.enabled
    && !config.whatsapp.enabled
    && !hasLlmCredentials(config.llm)

  if (cloudOnlyMode) {
    console.log('Mode: cloud server only')

    const dashboard = createDashboard({
      port: config.dashboard.port,
      secret: config.dashboard.secret,
      db,
      eventManager,
      userMemory,
      agentMemory,
      reasoning,
      health,
      config,
    })
    dashboard.start()
    console.log(`  Dashboard: http://${config.dashboard.host}:${config.dashboard.port}`)
    return
  }

  const llm = createProvider(config.llm)
  const productIdeas = new ProductIdeas(db, llm, agentMemory, config)
  const siteGenerator = new CommunitySiteGenerator(db, llm, agentMemory, config)

  // Rate-limited LLM queue
  const llmQueue = new PQueue({ concurrency: config.llm.maxConcurrent })

  // Messaging functions
  const bridges: Bridge[] = []
  let telegramMemberSync: TelegramMemberSync | undefined

  const sendDm = async (userId: string, message: string) => {
    const user = db.select().from(users)
      .where(or(eq(users.id, userId), eq(users.telegramId, userId), eq(users.whatsappId, userId)))
      .get()

    const directTargets = user
      ? [
        user.telegramId ? { platform: 'telegram' as const, chatId: user.telegramId.replace(/^tg_/, '') } : null,
        user.whatsappId ? { platform: 'whatsapp' as const, chatId: user.whatsappId.replace(/^wa_/, '') } : null,
      ].filter(Boolean)
      : [
        userId.startsWith('tg_') ? { platform: 'telegram' as const, chatId: userId.replace(/^tg_/, '') } : null,
        userId.startsWith('wa_') ? { platform: 'whatsapp' as const, chatId: userId.replace(/^wa_/, '') } : null,
      ].filter(Boolean)

    for (const bridge of bridges) {
      const target = directTargets.find((candidate) => candidate?.platform === bridge.platform)
      if (!target) continue
      try {
        await bridge.sendMessage({ platform: bridge.platform, chatId: target.chatId, text: message })
      } catch {}
    }
  }

  const sendGroup = async (message: string, options?: { messageThreadId?: number }) => {
    for (const bridge of bridges) {
      const groupId = bridge.platform === 'telegram'
        ? (
            bridge instanceof TelegramBridge
              ? bridge.getCurrentGroupChatId() || config.telegram.groupChatId
              : config.telegram.groupChatId
          )
        : config.whatsapp.groupId
      if (groupId) {
        try {
          await bridge.sendMessage({
            platform: bridge.platform,
            chatId: groupId,
            text: message,
            messageThreadId: bridge.platform === 'telegram' ? options?.messageThreadId : undefined,
          })
        } catch {}
      }
    }
  }

  // Agent core
  const agentCore = new AgentCore({
    llm, agentMemory, userMemory, eventManager, reasoning, config, sendDm, sendGroup,
    createGroupTopic: async (name: string) => {
      const telegram = bridges.find((bridge): bridge is TelegramBridge => bridge.platform === 'telegram' && bridge instanceof TelegramBridge)
      if (!telegram) throw new Error('Telegram bridge is not available')
      return telegram.createForumTopic(name)
    },
    groupPolicy,
    db,
  })

  // Smart targeting
  const targeting = new SmartTargeting(llm, eventManager, userMemory, reasoning, sendDm, db)

  // Router
  const router = new MessageRouter(
    db,
    config.community.adminUserIds,
    (msg, onProgress) => llmQueue.add(() => agentCore.handleMessage(msg, onProgress)) as Promise<string>,
    (cmd, msg) => llmQueue.add(() => agentCore.handleAdminQuestion(cmd)) as Promise<string>,
  )

  // Message handler for bridges
  const handleMessage = async (msg: InboundMessage) => {
    const progressSession = createProgressSession(msg, bridges)

    try {
      const response = await router.route(msg, progressSession?.update.bind(progressSession))
      if (response) {
        if (progressSession) {
          await progressSession.finish(response)
        } else {
          const bridge = bridges.find(b => b.platform === msg.platform)
          if (bridge) {
            await bridge.sendMessage({ platform: msg.platform, chatId: msg.chatId, text: response })
          }
        }
      }
    } catch (err) {
      console.error(`[${msg.platform}] message handling error:`, err)
      if (progressSession) {
        await progressSession.fail('I hit an internal error while processing that message. Please try again.')
      } else {
        const bridge = bridges.find(b => b.platform === msg.platform)
        if (bridge) {
          try {
            await bridge.sendMessage({
              platform: msg.platform,
              chatId: msg.chatId,
              text: 'I hit an internal error while processing that message. Please try again.',
            })
          } catch {}
        }
      }
    }
  }

  // Telegram bridge
  if (config.telegram.enabled && config.telegram.botToken) {
    const telegram = new TelegramBridge({
      botToken: config.telegram.botToken,
      groupChatId: config.telegram.groupChatId || '',
    })
    let cachedTelegramBotLink = config.publicPortal.botUrl || ''
    telegramMemberSync = new TelegramMemberSync(
      db,
      userMemory,
      reasoning,
      telegram,
      config.telegram.groupChatId || undefined,
    )
    const resolveTelegramBotLink = async () => {
      if (cachedTelegramBotLink) return cachedTelegramBotLink
      try {
        const me = await telegram.getMe()
        if (me.username) {
          cachedTelegramBotLink = `https://t.me/${me.username}`
        }
      } catch {}
      return cachedTelegramBotLink
    }
    const ensureTelegramEventsTopic = async (chat: TelegramChatInfo) => {
      const state = telegramEventsTopic.getState()
      if (state.chatId === chat.id && state.messageThreadId) return

      const [chatInfo, botMember] = await Promise.all([
        telegram.getChat(chat.id).catch(() => chat),
        telegram.getBotChatMember(chat.id).catch(() => undefined),
      ])

      const isForumEnabled = chatInfo.type === 'supergroup' && chatInfo.isForum === true
      const isAdmin = botMember?.status === 'administrator' || botMember?.status === 'creator'
      const canManageTopics = botMember?.status === 'creator' || botMember?.can_manage_topics === true

      if (!isForumEnabled || !isAdmin || !canManageTopics) {
        if (telegramEventsTopic.shouldAskForPermissions()) {
          await telegram.sendMessage({
            platform: 'telegram',
            chatId: chat.id,
            text: buildEventsTopicPermissionMessage({
              isForumEnabled,
              isAdmin,
              canManageTopics,
            }),
          }).catch(() => {})
          telegramEventsTopic.markPermissionRequested()
        }
        return
      }

      try {
        const topic = await telegram.createForumTopic(state.name || 'Events', chat.id)
        telegramEventsTopic.saveTopic(chat.id, topic.messageThreadId, topic.name)
        reasoning.emit_reasoning({
          jobName: 'telegram-topic-setup',
          level: 'decision',
          message: `Created Telegram Events topic in ${chat.title || chat.id}.`,
          data: { chatId: chat.id, messageThreadId: topic.messageThreadId },
        })
      } catch (error) {
        reasoning.emit_reasoning({
          jobName: 'telegram-topic-setup',
          level: 'detail',
          message: `Failed to create Telegram Events topic: ${String(error)}`,
          data: { chatId: chat.id },
        })
      }
    }
    const sendAdminSetupPrompt = async (chat: TelegramChatInfo) => {
      if (!await groupPolicy.shouldSendAdminSetupPrompt('telegram', chat.id)) return

      const admins = await telegram.getChatAdministrators(chat.id).catch(() => [])
      const humanAdmins = admins.filter((admin) => !admin.isBot)
      const botLink = await resolveTelegramBotLink()

      await telegram.sendMessage({
        platform: 'telegram',
        chatId: chat.id,
        text: buildAdminSetupPromptMessage(humanAdmins, botLink),
      }).catch(() => {})

      await groupPolicy.markAdminSetupPromptSent('telegram', chat.id)
    }
    const welcomeNewMembers = async (chat: TelegramChatInfo, members: TelegramMemberProfile[]) => {
      const humanMembers = members.filter((member) => !member.isBot)
      if (humanMembers.length === 0) return

      const botLink = await resolveTelegramBotLink()
      await telegram.sendMessage({
        platform: 'telegram',
        chatId: chat.id,
        text: buildJoinWelcomeMessage(botLink),
      }).catch(() => {})
    }
    telegram.onGroupConnected(async (chat) => {
      await telegramMemberSync!.handleBotAdded(chat)
      await ensureTelegramEventsTopic(chat)
      if (await groupPolicy.shouldSendIntro('telegram', chat.id)) {
        await telegram.sendMessage({
          platform: 'telegram',
          chatId: chat.id,
          text: buildGroupIntroMessage(config.community.name, config.community.language),
        }).catch(() => {})
        await groupPolicy.markIntroSent('telegram', chat.id)
      }
      await sendAdminSetupPrompt(chat)
    })
    telegram.onBotMemberUpdated(async (chat) => {
      await ensureTelegramEventsTopic(chat)
    })
    telegram.onMembersAdded(async (chat, members, source) => {
      await telegramMemberSync!.handleMembersAdded(chat, members, source)
      await welcomeNewMembers(chat, members)
    })
    telegram.onMemberStatusChanged((chat, member, oldStatus, newStatus, source) =>
      telegramMemberSync!.handleMemberStatusChange(chat, member, oldStatus, newStatus, source))
    telegram.onMessage(handleMessage)
    bridges.push(telegram)
    runWithRestart('telegram', () => telegram.start(), health)
    void telegramMemberSync.syncKnownMembers().catch((error) => {
      reasoning.emit_reasoning({
        jobName: 'telegram-member-sync',
        level: 'detail',
        message: `Initial Telegram member sync failed: ${String(error)}`,
      })
    })
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
    telegramMemberSync,
    productIdeas,
    reason: (jobName: string, level: string, message: string, data?: Record<string, unknown>) => {
      reasoning.emit_reasoning({ jobName, level: level as any, message, data })
    },
  }
  runWithRestart('scheduler', () => scheduler.start(jobCtx), health)

  const cloudSync = new CloudSyncClient({
    config,
    portal: publicPortal,
    onStatus: (level, message) => {
      reasoning.emit_reasoning({
        jobName: 'cloud-sync',
        level: level === 'error' ? 'detail' : level,
        message,
      })
    },
  })
  await cloudSync.start().catch((error) => {
    console.error('[cloud-sync] failed to start:', error)
  })

  // Dashboard
  const dashboard = createDashboard({
    port: config.dashboard.port,
    secret: config.dashboard.secret,
    db, eventManager, userMemory, agentMemory, reasoning, health, config, agentCore, productIdeas, siteGenerator,
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
  const failedDir = path.join(process.cwd(), 'import', 'failed')
  const analyzer = new ImportAnalyzer(llm, reasoning)
  const seeder = new ImportSeeder(db, userMemory, agentMemory)
  const watcher = new ImportWatcher(db, inboxDir, processedDir, failedDir, analyzer, seeder, reasoning)
  runWithRestart('import-watcher', () => watcher.start(), health)

  console.log(`\n✓ All systems ready`)
  console.log(`  Dashboard: http://${config.dashboard.host}:${config.dashboard.port}`)
}

function hasLlmCredentials(config: ReturnType<typeof loadConfig>['llm']) {
  return Boolean(config.anthropicApiKey || config.openaiApiKey || config.openrouterApiKey)
}

function buildGroupIntroMessage(communityName: string, language: string) {
  if (language.toLowerCase().startsWith('es')) {
    return `Hola, soy Comunia, el gestor de comunidad con IA de ${communityName}. ` +
      `Estoy acá para ayudar a que la gente se conecte mejor, descubra afinidades y organice planes juntos. ` +
      `En este grupo voy a quedarme bastante en silencio: por defecto solo hablo acá si un admin me llama explícitamente. ` +
      `Si quieres empezar a organizar un plan, conocer gente afín o pensar una idea, escríbeme por privado 1:1.`
  }

  if (language.toLowerCase().startsWith('pt')) {
    return `Oi, eu sou a Comunia, a agente de comunidade com IA de ${communityName}. ` +
      `Estou aqui para ajudar as pessoas a se conectarem melhor, descobrirem afinidades e organizarem planos juntas. ` +
      `Neste grupo eu vou ficar mais em silêncio: por padrão só falo aqui quando um admin me chama explicitamente. ` +
      `Se quiser começar a organizar um plano, conhecer pessoas com interesses parecidos ou pensar em uma ideia, me chama no 1:1.`
  }

  return `Hi, I'm Comunia, the AI community manager for ${communityName}. ` +
    `I'm here to help people make better connections, discover shared interests, and organize plans together. ` +
    `I'll stay mostly quiet in this group: by default I only speak here when an admin explicitly calls on me. ` +
    `If you want help organizing something, meeting the right people, or shaping an idea, message me 1:1.`
}

function buildEventsTopicPermissionMessage(input: {
  isForumEnabled: boolean
  isAdmin: boolean
  canManageTopics: boolean
}) {
  const missing: string[] = []
  if (!input.isAdmin) missing.push('promote me to admin')
  if (!input.isForumEnabled) missing.push('enable Topics for this supergroup')
  if (!input.canManageTopics) missing.push('turn on the Manage Topics permission for me')

  return [
    'I can set up the Events topic for this group, but I am still missing the Telegram setup needed to do it.',
    missing.length > 0 ? `Please ${missing.join(', and ')}.` : '',
    'Once that is enabled, I will create the Events topic automatically.',
  ].filter(Boolean).join(' ')
}

function buildJoinWelcomeMessage(botLink?: string) {
  const base = 'Welcome to the new cool Barrio of Buenos Aires, Please send me a dm so i can learn a bit more about you.'
  if (botLink) {
    return `${base} ${botLink}`
  }
  return `${base} Talk to me here in Telegram so you can open the DM.`
}

function buildAdminSetupPromptMessage(admins: TelegramMemberProfile[], botLink?: string) {
  const mentions = admins
    .map((admin) => admin.username ? `@${admin.username}` : admin.firstName)
    .filter(Boolean)
    .join(' ')

  const intro = mentions
    ? `${mentions} please DM me so I can gather the core information about this community and populate the soul.md for this group.`
    : 'Admins, please DM me so I can gather the core information about this community and populate the soul.md for this group.'

  if (botLink) {
    return `${intro} ${botLink}`
  }

  return `${intro} Talk to me here in Telegram to open the DM.`
}

const isDirectExecution = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  startApp().catch(console.error)
}

function createProgressSession(msg: InboundMessage, bridges: Bridge[]): TelegramProgressSession | undefined {
  if (msg.platform !== 'telegram') return undefined

  const bridge = bridges.find((candidate): candidate is TelegramBridge =>
    candidate.platform === 'telegram' && candidate instanceof TelegramBridge)

  if (!bridge) return undefined
  return new TelegramProgressSession(bridge, msg.chatId, msg.replyTo)
}

class TelegramProgressSession {
  private messageId?: number
  private lastText?: string
  private typingTimer?: NodeJS.Timeout

  constructor(
    private bridge: TelegramBridge,
    private chatId: string,
    private replyTo?: string,
  ) {}

  async update(text: string): Promise<void> {
    if (!text || text === this.lastText) return

    this.lastText = text
    await this.ensureProgressMessage(text)
  }

  async finish(finalText: string): Promise<void> {
    this.stopTyping()

    if (this.messageId === undefined) {
      await this.bridge.sendMessage({
        platform: 'telegram',
        chatId: this.chatId,
        text: finalText,
        replyTo: this.replyTo,
      })
      return
    }

    try {
      await this.bridge.editMessageText(this.chatId, this.messageId, finalText)
    } catch {
      await this.bridge.sendMessage({
        platform: 'telegram',
        chatId: this.chatId,
        text: finalText,
        replyTo: this.replyTo,
      })
    }
  }

  async fail(message: string): Promise<void> {
    await this.finish(message)
  }

  private async ensureProgressMessage(text: string): Promise<void> {
    await this.bridge.sendChatAction(this.chatId, 'typing').catch(() => {})
    this.startTyping()

    if (this.messageId === undefined) {
      const sent = await this.bridge.sendMessageWithMetadata({
        platform: 'telegram',
        chatId: this.chatId,
        text,
        replyTo: this.replyTo,
      })
      this.messageId = sent.messageId
      return
    }

    await this.bridge.editMessageText(this.chatId, this.messageId, text).catch(() => {})
  }

  private startTyping(): void {
    if (this.typingTimer) return

    this.typingTimer = setInterval(() => {
      void this.bridge.sendChatAction(this.chatId, 'typing').catch(() => {})
    }, 4000)
  }

  private stopTyping(): void {
    if (!this.typingTimer) return
    clearInterval(this.typingTimer)
    this.typingTimer = undefined
  }
}
