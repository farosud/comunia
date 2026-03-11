import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { CommunityWorkspaceStore } from '../cli/community-workspaces.js'

describe('CommunityWorkspaceStore', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('registers valid workspaces and lists the current directory first', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-workspaces-'))
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-community-'))
    tempDirs.push(baseDir, workspaceDir)

    fs.mkdirSync(path.join(workspaceDir, 'agent'), { recursive: true })
    fs.writeFileSync(path.join(workspaceDir, '.env'), 'COMMUNITY_NAME=Founders BA\n')
    fs.writeFileSync(path.join(workspaceDir, 'agent', 'agent.md'), '# Agent')
    fs.writeFileSync(path.join(workspaceDir, 'agent', 'soul.md'), '# Soul')

    const store = new CommunityWorkspaceStore(baseDir)
    const registered = store.register(workspaceDir)
    const listed = store.list(workspaceDir)

    expect(registered?.name).toBe('Founders BA')
    expect(listed).toHaveLength(1)
    expect(listed[0].isCurrent).toBe(true)
    expect(listed[0].path).toBe(path.resolve(workspaceDir))
  })

  it('creates unique managed workspace directories', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-workspaces-'))
    tempDirs.push(baseDir)

    const store = new CommunityWorkspaceStore(baseDir)
    const first = store.createManagedWorkspace('Founders BA')
    const second = store.createManagedWorkspace('Founders BA')

    expect(first).not.toBe(second)
    expect(path.basename(first)).toBe('founders-ba')
    expect(path.basename(second)).toBe('founders-ba-2')
  })
})
