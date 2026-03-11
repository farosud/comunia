import * as p from '@clack/prompts'
import fs from 'fs'

export async function runInit() {
  p.intro('comunia setup wizard')

  // 1. Platform selection
  const platform = await p.select({
    message: 'Which messaging platform?',
    options: [
      { value: 'telegram', label: 'Telegram (recommended)' },
      { value: 'whatsapp', label: 'WhatsApp Cloud API' },
      { value: 'both', label: 'Both' },
    ],
  })
  if (p.isCancel(platform)) return process.exit(0)

  let telegramToken = ''
  let telegramGroupId = ''
  let whatsappToken = ''
  let whatsappPhoneId = ''
  let whatsappVerifyToken = ''

  // 2. Platform-specific setup
  if (platform === 'telegram' || platform === 'both') {
    p.note(
      '1. Open Telegram and message @BotFather\n' +
      '2. Send /newbot and follow prompts\n' +
      '3. Copy the bot token',
      'Telegram Setup'
    )

    const token = await p.text({
      message: 'Paste your Telegram bot token:',
      validate: (v) => v && v.includes(':') ? undefined : 'Token should contain a colon (:)',
    })
    if (p.isCancel(token)) return process.exit(0)
    telegramToken = token

    const groupId = await p.text({
      message: 'Telegram group chat ID (or leave empty to detect later):',
      defaultValue: '',
    })
    if (p.isCancel(groupId)) return process.exit(0)
    telegramGroupId = groupId || ''
  }

  if (platform === 'whatsapp' || platform === 'both') {
    p.note(
      '1. Go to developers.facebook.com\n' +
      '2. Create a WhatsApp Business app\n' +
      '3. Get your access token and phone number ID',
      'WhatsApp Cloud API Setup'
    )

    const waToken = await p.text({ message: 'WhatsApp Cloud API token:' })
    if (p.isCancel(waToken)) return process.exit(0)
    whatsappToken = waToken

    const phoneId = await p.text({ message: 'Phone Number ID:' })
    if (p.isCancel(phoneId)) return process.exit(0)
    whatsappPhoneId = phoneId

    whatsappVerifyToken = `comunia-${Date.now()}`
    p.note(`Your webhook verify token: ${whatsappVerifyToken}`, 'Save this')
  }

  // 3. Community info
  const communityName = await p.text({
    message: 'Community name:',
    placeholder: 'Crecimiento Argentina',
  })
  if (p.isCancel(communityName)) return process.exit(0)

  const language = await p.select({
    message: 'Primary language:',
    options: [
      { value: 'es-AR', label: 'Spanish (Argentina)' },
      { value: 'es', label: 'Spanish' },
      { value: 'en', label: 'English' },
      { value: 'pt-BR', label: 'Portuguese (Brazil)' },
    ],
  })
  if (p.isCancel(language)) return process.exit(0)

  const communityType = await p.select({
    message: 'Community type:',
    options: [
      { value: 'local', label: 'Local (same city)' },
      { value: 'distributed', label: 'Distributed (online/global)' },
      { value: 'hybrid', label: 'Hybrid (mix of local + remote)' },
    ],
  })
  if (p.isCancel(communityType)) return process.exit(0)

  let location = ''
  if (communityType === 'local' || communityType === 'hybrid') {
    const loc = await p.text({
      message: 'Community location:',
      placeholder: 'Buenos Aires, AR',
    })
    if (p.isCancel(loc)) return process.exit(0)
    location = loc
  }

  // 4. LLM provider
  const llmProvider = await p.select({
    message: 'LLM provider:',
    options: [
      { value: 'claude', label: 'Claude (Anthropic) - recommended' },
      { value: 'openai', label: 'OpenAI (GPT-4o)' },
      { value: 'openrouter', label: 'OpenRouter - access multiple models with one API key' },
    ],
  })
  if (p.isCancel(llmProvider)) return process.exit(0)

  let apiKey = ''
  let openrouterModel = ''

  if (llmProvider === 'openrouter') {
    const orKey = await p.text({
      message: 'OpenRouter API key:',
      validate: (v) => v && v.length > 10 ? undefined : 'Key seems too short',
    })
    if (p.isCancel(orKey)) return process.exit(0)
    apiKey = orKey

    const model = await p.text({
      message: 'OpenRouter model (e.g. anthropic/claude-sonnet-4, openai/gpt-4o):',
      defaultValue: 'anthropic/claude-sonnet-4',
    })
    if (p.isCancel(model)) return process.exit(0)
    openrouterModel = model || 'anthropic/claude-sonnet-4'
  } else {
    const key = await p.text({
      message: `${llmProvider === 'claude' ? 'Anthropic' : 'OpenAI'} API key:`,
      validate: (v) => v && v.length > 10 ? undefined : 'Key seems too short',
    })
    if (p.isCancel(key)) return process.exit(0)
    apiKey = key
  }

  // 5. Dashboard secret
  const dashboardSecret = `comunia-${Date.now()}-${Math.random().toString(36).slice(2)}`

  // 6. Write .env
  let llmEnvLines = `LLM_PROVIDER=${llmProvider}\n`
  if (llmProvider === 'claude') {
    llmEnvLines += `ANTHROPIC_API_KEY=${apiKey}`
  } else if (llmProvider === 'openai') {
    llmEnvLines += `OPENAI_API_KEY=${apiKey}`
  } else if (llmProvider === 'openrouter') {
    llmEnvLines += `OPENROUTER_API_KEY=${apiKey}\nOPENROUTER_MODEL=${openrouterModel}`
  }

  const envContent = `# === LLM ===
${llmEnvLines}

# === Telegram ===
TELEGRAM_ENABLED=${platform === 'telegram' || platform === 'both' ? 'true' : 'false'}
TELEGRAM_BOT_TOKEN=${telegramToken}
TELEGRAM_GROUP_CHAT_ID=${telegramGroupId}

# === WhatsApp ===
WHATSAPP_ENABLED=${platform === 'whatsapp' || platform === 'both' ? 'true' : 'false'}
WHATSAPP_PROVIDER=cloud_api
WHATSAPP_CLOUD_API_TOKEN=${whatsappToken}
WHATSAPP_PHONE_NUMBER_ID=${whatsappPhoneId}
WHATSAPP_VERIFY_TOKEN=${whatsappVerifyToken}

# === Community ===
COMMUNITY_NAME=${communityName}
COMMUNITY_LANGUAGE=${language}
COMMUNITY_TYPE=${communityType}
COMMUNITY_LOCATION=${location}
ADMIN_USER_IDS=

# === Dashboard ===
DASHBOARD_PORT=3000
DASHBOARD_SECRET=${dashboardSecret}

# === Scheduler ===
REMINDER_HOURS_BEFORE=48,2
FEEDBACK_DELAY_HOURS=24
DIGEST_CRON=0 10 * * 1
REFLECTION_CRON=0 3 * * *
VENUE_RESEARCH_CRON=0 9 * * 3
EVENT_IDEATION_CRON=0 10 * * 1
SUBGROUP_ANALYSIS_CRON=0 4 * * 0

# === Limits ===
LLM_MAX_CONCURRENT=10
LLM_MAX_PER_MINUTE=30
`

  fs.writeFileSync('.env', envContent)
  p.log.success('.env created')

  // 7. Create agent directory and copy templates
  fs.mkdirSync('agent', { recursive: true })

  if (!fs.existsSync('agent/soul.md') && fs.existsSync('templates/soul.example.md')) {
    fs.copyFileSync('templates/soul.example.md', 'agent/soul.md')
    p.log.success('agent/soul.md created from template')
  } else if (!fs.existsSync('agent/soul.md')) {
    fs.writeFileSync('agent/soul.md', `# ${communityName} - Soul\n\nYou are the community manager for ${communityName}. You speak ${language}. You are warm, helpful, and proactive.\n`)
    p.log.success('agent/soul.md created')
  }

  if (!fs.existsSync('agent/agent.md') && fs.existsSync('templates/agent.example.md')) {
    fs.copyFileSync('templates/agent.example.md', 'agent/agent.md')
  } else if (!fs.existsSync('agent/agent.md')) {
    fs.writeFileSync('agent/agent.md', '# Agent Capabilities\n\nYou can create events, manage RSVPs, send messages, and learn about community members.\n')
  }
  p.log.success('agent/agent.md ready')

  if (!fs.existsSync('agent/memory.md')) {
    fs.writeFileSync('agent/memory.md', '# Community Memory\n\nNothing learned yet. This file will be updated as I learn about the community.\n')
  }
  p.log.success('agent/memory.md ready')

  // 8. Create import directories
  fs.mkdirSync('import/inbox', { recursive: true })
  fs.mkdirSync('import/processed', { recursive: true })

  p.note(
    `Dashboard secret: ${dashboardSecret}\n` +
    `Dashboard URL: http://localhost:3000\n\n` +
    'Next steps:\n' +
    '1. Run: docker compose up (or npm run dev)\n' +
    '2. Add the bot to your group chat\n' +
    '3. Open the dashboard to manage events',
    'Setup Complete!'
  )

  p.outro('Ready to go!')
}
