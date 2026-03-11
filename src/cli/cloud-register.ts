import * as p from '@clack/prompts'
import fs from 'fs'
import path from 'path'
import { loadConfig } from '../config.js'

interface CloudRegistrationResult {
  slug: string
  token: string
  publicUrl?: string
}

export async function requestCloudPublishCredential(input: {
  publishUrl: string
  slug: string
  communityName: string
}): Promise<CloudRegistrationResult> {
  const url = `${input.publishUrl.replace(/\/$/, '')}/cloud-api/register`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: input.slug,
      communityName: input.communityName,
    }),
  }).catch((error) => {
    throw new Error(`Failed to reach Comunia Cloud: ${String(error)}`)
  })

  const text = await response.text()
  const payload = text ? safeJsonParse(text) : {}
  if (!response.ok) {
    throw new Error((payload as any).error || `Cloud registration failed (${response.status})`)
  }

  return payload as CloudRegistrationResult
}

export async function runCloudRegister() {
  try {
    const config = loadConfig()
    if (!['cloud', 'both'].includes(config.publicPortal.mode)) {
      p.log.error('This workspace is not configured for Comunia Cloud.')
      p.note('Set PUBLIC_PORTAL_MODE=cloud or both first.', 'Cloud Registration Disabled')
      return process.exit(1)
    }

    if (!config.cloud.publishUrl || !config.cloud.publishSlug) {
      p.log.error('COMUNIA_CLOUD_URL and COMUNIA_CLOUD_SLUG are required.')
      return process.exit(1)
    }

    const result = await requestCloudPublishCredential({
      publishUrl: config.cloud.publishUrl,
      slug: config.cloud.publishSlug,
      communityName: config.community.name,
    })

    upsertEnvValue(path.join(process.cwd(), '.env'), 'COMUNIA_CLOUD_TOKEN', result.token)
    p.note(
      `Slug: ${result.slug}\nPublic URL: ${result.publicUrl || `${config.cloud.publishUrl.replace(/\/$/, '')}/${result.slug}`}`,
      'Cloud Registration Complete',
    )
    p.outro('Stored the publish token in .env as COMUNIA_CLOUD_TOKEN.')
  } catch (error) {
    p.log.error(String(error))
    process.exit(1)
  }
}

function upsertEnvValue(filePath: string, key: string, value: string) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${escapeRegex(key)}=.*$`, 'm')
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current}${current.endsWith('\n') || current.length === 0 ? '' : '\n'}${line}\n`
  fs.writeFileSync(filePath, next)
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return { error: value }
  }
}
