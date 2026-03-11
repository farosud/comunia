import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

loadEnv()

// Safe boolean parsing — "false" → false, "true" → true, undefined → default
const boolString = z.string().optional().transform(s => s === 'true')

const configSchema = z.object({
  llm: z.object({
    provider: z.enum(['claude', 'openai', 'openrouter', 'ollama']).default('claude'),
    anthropicApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
    openrouterApiKey: z.string().optional(),
    openrouterModel: z.string().default('anthropic/claude-sonnet-4').optional(),
    ollamaUrl: z.string().optional(),
    maxConcurrent: z.coerce.number().default(10),
    maxPerMinute: z.coerce.number().default(30),
  }),
  telegram: z.object({
    enabled: boolString,
    botToken: z.string().optional(),
    groupChatId: z.string().optional(),
  }),
  whatsapp: z.object({
    enabled: boolString,
    provider: z.enum(['cloud_api', 'baileys']).default('cloud_api'),
    cloudApiToken: z.string().optional(),
    phoneNumberId: z.string().optional(),
    verifyToken: z.string().optional(),
    groupId: z.string().optional(),
  }),
  community: z.object({
    name: z.string().default('My Community'),
    language: z.string().default('en'),
    type: z.enum(['local', 'distributed', 'hybrid']).default('local'),
    location: z.string().optional(),
    adminUserIds: z.string().default('').transform(s => s ? s.split(',').map(id => id.trim()) : []),
  }),
  scheduler: z.object({
    reminderHoursBefore: z.string().default('48,2').transform(s => s.split(',').map(Number)),
    feedbackDelayHours: z.coerce.number().default(24),
    digestCron: z.string().default('0 10 * * 1'),
    reflectionCron: z.string().default('0 3 * * *'),
    venueResearchCron: z.string().default('0 9 * * 3'),
    eventIdeationCron: z.string().default('0 10 * * 1'),
    subgroupAnalysisCron: z.string().default('0 4 * * 0'),
  }),
  dashboard: z.object({
    port: z.coerce.number().default(3000),
    secret: z.string().min(1, 'DASHBOARD_SECRET is required'),
  }),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(): Config {
  return configSchema.parse({
    llm: {
      provider: process.env.LLM_PROVIDER,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterModel: process.env.OPENROUTER_MODEL,
      ollamaUrl: process.env.OLLAMA_URL,
      maxConcurrent: process.env.LLM_MAX_CONCURRENT,
      maxPerMinute: process.env.LLM_MAX_PER_MINUTE,
    },
    telegram: {
      enabled: process.env.TELEGRAM_ENABLED,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      groupChatId: process.env.TELEGRAM_GROUP_CHAT_ID,
    },
    whatsapp: {
      enabled: process.env.WHATSAPP_ENABLED,
      provider: process.env.WHATSAPP_PROVIDER,
      cloudApiToken: process.env.WHATSAPP_CLOUD_API_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      groupId: process.env.WHATSAPP_GROUP_ID,
    },
    community: {
      name: process.env.COMMUNITY_NAME,
      language: process.env.COMMUNITY_LANGUAGE,
      type: process.env.COMMUNITY_TYPE,
      location: process.env.COMMUNITY_LOCATION,
      adminUserIds: process.env.ADMIN_USER_IDS,
    },
    scheduler: {
      reminderHoursBefore: process.env.REMINDER_HOURS_BEFORE,
      feedbackDelayHours: process.env.FEEDBACK_DELAY_HOURS,
      digestCron: process.env.DIGEST_CRON,
      reflectionCron: process.env.REFLECTION_CRON,
      venueResearchCron: process.env.VENUE_RESEARCH_CRON,
      eventIdeationCron: process.env.EVENT_IDEATION_CRON,
      subgroupAnalysisCron: process.env.SUBGROUP_ANALYSIS_CRON,
    },
    dashboard: {
      port: process.env.DASHBOARD_PORT,
      secret: process.env.DASHBOARD_SECRET,
    },
  })
}
