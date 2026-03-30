import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureWorkspaceDashboardPort, suggestDashboardPort } from '../cli/dashboard-port.js'

const tempDirs: string[] = []
const servers: net.Server[] = []

describe('dashboard port helpers', () => {
  afterEach(async () => {
    while (servers.length) {
      const server = servers.pop()
      await new Promise((resolve) => server?.close(resolve))
    }

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('suggests a free dashboard port when 3000 is already taken', async () => {
    const busyPort = await reserveBusyPort()
    const workspace = createWorkspace('Sideprojects', busyPort)

    const port = await suggestDashboardPort(workspace, busyPort)
    expect(port).not.toBe(busyPort)
    expect(port).toBeGreaterThan(busyPort)
  })

  it('repairs a workspace env when its configured port is already in use', async () => {
    const busyPort = await reserveBusyPort()
    const workspace = createWorkspace('Upperclass', busyPort)

    const result = await ensureWorkspaceDashboardPort(workspace)
    expect(result.changed).toBe(true)
    expect(result.port).not.toBe(busyPort)

    const env = fs.readFileSync(path.join(workspace, '.env'), 'utf8')
    expect(env).toContain(`DASHBOARD_PORT=${result.port}`)
  })
})

function createWorkspace(name: string, port: number) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'comunia-dashboard-port-'))
  tempDirs.push(workspace)
  fs.mkdirSync(path.join(workspace, 'agent'), { recursive: true })
  fs.writeFileSync(path.join(workspace, '.env'), `COMMUNITY_NAME=${name}\nDASHBOARD_HOST=127.0.0.1\nDASHBOARD_PORT=${port}\nDASHBOARD_SECRET=test-secret\n`)
  fs.writeFileSync(path.join(workspace, 'agent', 'agent.md'), '# Agent')
  fs.writeFileSync(path.join(workspace, 'agent', 'soul.md'), '# Soul')
  return workspace
}

async function reserveBusyPort() {
  const server = net.createServer()
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine busy port')
  }
  return address.port
}
