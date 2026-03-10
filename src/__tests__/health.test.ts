import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HealthMonitor } from '../health.js'

describe('HealthMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks connection status', () => {
    const health = new HealthMonitor()
    health.update('telegram', 'connected')
    health.update('whatsapp', 'disconnected')

    const all = health.getAll()
    expect(all.telegram.status).toBe('connected')
    expect(all.whatsapp.status).toBe('disconnected')
  })

  it('preserves uptime when status unchanged', () => {
    const health = new HealthMonitor()
    health.update('telegram', 'connected')
    const first = health.getAll().telegram.since

    vi.advanceTimersByTime(1000)
    health.update('telegram', 'connected')
    expect(health.getAll().telegram.since).toBe(first)
  })

  it('resets uptime on status change', () => {
    const health = new HealthMonitor()
    health.update('telegram', 'connected')
    const first = health.getAll().telegram.since

    vi.advanceTimersByTime(1000)
    health.update('telegram', 'error', 'connection lost')
    expect(health.getAll().telegram.since).not.toBe(first)
    expect(health.getAll().telegram.error).toBe('connection lost')
  })
})
