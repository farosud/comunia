import { describe, it, expect, beforeEach } from 'vitest'
import { loadConfig } from '../config.js'

describe('loadConfig', () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = 'claude'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    process.env.TELEGRAM_ENABLED = 'true'
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.COMMUNITY_NAME = 'Test Community'
    process.env.DASHBOARD_SECRET = 'test-secret'
  })

  it('parses valid config', () => {
    const config = loadConfig()
    expect(config.llm.provider).toBe('claude')
    expect(config.community.name).toBe('Test Community')
    expect(config.telegram.enabled).toBe(true)
  })

  it('parses "false" string as false (not truthy)', () => {
    process.env.WHATSAPP_ENABLED = 'false'
    const config = loadConfig()
    expect(config.whatsapp.enabled).toBe(false)
  })

  it('parses undefined enabled as false', () => {
    delete process.env.TELEGRAM_ENABLED
    const config = loadConfig()
    expect(config.telegram.enabled).toBe(false)
  })

  it('uses defaults for optional fields', () => {
    delete process.env.COMMUNITY_NAME
    const config = loadConfig()
    expect(config.community.name).toBe('My Community')
  })

  it('parses admin user IDs', () => {
    process.env.ADMIN_USER_IDS = 'user1,user2,user3'
    const config = loadConfig()
    expect(config.community.adminUserIds).toEqual(['user1', 'user2', 'user3'])
  })

  it('parses community type', () => {
    process.env.COMMUNITY_TYPE = 'distributed'
    const config = loadConfig()
    expect(config.community.type).toBe('distributed')
  })

  it('requires DASHBOARD_SECRET', () => {
    delete process.env.DASHBOARD_SECRET
    expect(() => loadConfig()).toThrow()
  })

  it('defaults whatsapp provider to cloud_api', () => {
    const config = loadConfig()
    expect(config.whatsapp.provider).toBe('cloud_api')
  })
})
