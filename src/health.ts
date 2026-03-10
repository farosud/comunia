export class HealthMonitor {
  private statuses = new Map<string, {
    name: string
    status: 'connected' | 'disconnected' | 'error'
    since: string
    lastActivity?: string
    error?: string
  }>()

  update(name: string, status: 'connected' | 'disconnected' | 'error', error?: string) {
    const existing = this.statuses.get(name)
    const now = new Date().toISOString()
    this.statuses.set(name, {
      name,
      status,
      since: existing?.status === status ? existing.since : now,
      lastActivity: now,
      error,
    })
  }

  getAll(): Record<string, { name: string; status: string; since: string; lastActivity?: string; error?: string }> {
    return Object.fromEntries(this.statuses)
  }
}
