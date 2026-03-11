import type { Config } from '../config.js'
import type { PublicPortal } from './public-portal.js'

interface CloudSyncClientOptions {
  config: Config
  portal: PublicPortal
  fetchImpl?: typeof fetch
  onStatus?: (level: 'detail' | 'error', message: string) => void
}

export class CloudSyncClient {
  private readonly fetchImpl: typeof fetch
  private timer: ReturnType<typeof setInterval> | undefined
  private lastFingerprint = ''
  private isSyncing = false

  constructor(private readonly options: CloudSyncClientOptions) {
    this.fetchImpl = options.fetchImpl || fetch
  }

  isEnabled() {
    return ['cloud', 'both'].includes(this.options.config.publicPortal.mode)
      && Boolean(this.options.config.cloud.publishUrl)
      && Boolean(this.options.config.cloud.publishSlug)
  }

  async syncNow(force = false) {
    if (!this.isEnabled()) return false
    if (this.isSyncing) return false

    this.isSyncing = true
    try {
      const payload = await this.buildPayload()
      const fingerprint = JSON.stringify(payload)
      if (!force && fingerprint === this.lastFingerprint) return false

      const response = await this.fetchImpl(this.publishUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cloud-publish-token': this.options.config.cloud.publishToken,
        },
        body: JSON.stringify(payload),
      }).catch((error) => {
        throw new Error(`Failed to reach Comunia Cloud: ${String(error)}`)
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Cloud sync failed (${response.status}): ${text}`)
      }

      this.lastFingerprint = fingerprint
      this.options.onStatus?.('detail', `Cloud portal synced for ${this.options.config.cloud.publishSlug}`)
      return true
    } finally {
      this.isSyncing = false
    }
  }

  async start() {
    if (!this.isEnabled()) return

    await this.syncNow(true).catch((error) => {
      this.options.onStatus?.('error', String(error))
    })

    const intervalMs = Math.max(3000, this.options.config.cloud.syncIntervalMs)
    this.timer = setInterval(() => {
      void this.syncNow().catch((error) => {
        this.options.onStatus?.('error', String(error))
      })
    }, intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private publishUrl() {
    return `${this.options.config.cloud.publishUrl.replace(/\/$/, '')}/cloud-api/publish/${this.options.config.cloud.publishSlug}`
  }

  private async buildPayload() {
    const snapshot = await this.options.portal.getPublicSnapshot()
    const settings = await this.options.portal.getSettings()

    return {
      slug: this.options.config.cloud.publishSlug,
      communityName: this.options.config.community.name,
      passcode: settings.passcode,
      botUrl: settings.botUrl,
      snapshot,
    }
  }
}
