import * as p from '@clack/prompts'
import { loadConfig } from '../config.js'
import { createDb } from '../db/index.js'
import { PublicPortal } from '../community/public-portal.js'
import { CloudSyncClient } from '../community/cloud-sync.js'

export async function runPublish() {
  try {
    const config = loadConfig()
    const db = createDb(config.database.path)
    const portal = new PublicPortal(db, config)

    if (!['cloud', 'both'].includes(config.publicPortal.mode)) {
      p.log.error('This community is not configured for Comunia Cloud publishing.')
      p.note('Set PUBLIC_PORTAL_MODE=cloud or both, then configure COMUNIA_CLOUD_URL and COMUNIA_CLOUD_SLUG.', 'Publishing Disabled')
      return process.exit(1)
    }

    if (!config.cloud.publishUrl || !config.cloud.publishSlug) {
      p.log.error('Missing Comunia Cloud publishing configuration.')
      p.note('COMUNIA_CLOUD_URL and COMUNIA_CLOUD_SLUG are required.', 'Publishing Disabled')
      return process.exit(1)
    }

    p.intro('Publishing public portal to Comunia Cloud')
    const sync = new CloudSyncClient({ config, portal })
    await sync.syncNow(true)
    p.note(
      `Published URL: ${config.cloud.publishUrl.replace(/\/$/, '')}/${config.cloud.publishSlug}\n` +
      `Updated at: ${new Date().toISOString()}`,
      'Publish Complete',
    )
    p.outro('Comunia Cloud publish finished.')
  } catch (error) {
    p.log.error(String(error))
    process.exit(1)
  }
}
