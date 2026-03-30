import fs from 'fs'
import net from 'net'
import path from 'path'
import { parse as parseEnv } from 'dotenv'
import { CommunityWorkspaceStore } from './community-workspaces.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3000
const MAX_PORT_SCAN = 200

export async function suggestDashboardPort(
  workspacePath: string,
  preferredPort: number = DEFAULT_PORT,
): Promise<number> {
  const store = new CommunityWorkspaceStore()
  const reservedPorts = new Set<number>()

  for (const workspace of store.list(workspacePath)) {
    const env = readWorkspaceEnv(workspace.path)
    const port = Number(env.DASHBOARD_PORT || '')
    if (Number.isInteger(port) && port > 0) {
      reservedPorts.add(port)
    }
  }

  for (let offset = 0; offset < MAX_PORT_SCAN; offset++) {
    const candidate = preferredPort + offset
    if (reservedPorts.has(candidate) && path.resolve(workspacePath) !== path.resolve(findWorkspaceByPort(store, workspacePath, candidate) || '')) {
      continue
    }
    if (await isPortAvailable(DEFAULT_HOST, candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find a free dashboard port starting from ${preferredPort}`)
}

export async function ensureWorkspaceDashboardPort(workspacePath: string): Promise<{ port: number; changed: boolean }> {
  const env = readWorkspaceEnv(workspacePath)
  const host = env.DASHBOARD_HOST || DEFAULT_HOST
  const currentPort = Number(env.DASHBOARD_PORT || DEFAULT_PORT)

  if (Number.isInteger(currentPort) && currentPort > 0 && await isPortAvailable(host, currentPort)) {
    return { port: currentPort, changed: false }
  }

  const port = await suggestDashboardPort(workspacePath, Number.isInteger(currentPort) && currentPort > 0 ? currentPort + 1 : DEFAULT_PORT)
  upsertEnvValue(path.join(workspacePath, '.env'), 'DASHBOARD_PORT', String(port))
  return { port, changed: true }
}

function findWorkspaceByPort(store: CommunityWorkspaceStore, workspacePath: string, port: number) {
  return store.list(workspacePath).find((workspace) => {
    const env = readWorkspaceEnv(workspace.path)
    return Number(env.DASHBOARD_PORT || '') === port
  })?.path
}

function readWorkspaceEnv(workspacePath: string): Record<string, string> {
  const envPath = path.join(workspacePath, '.env')
  if (!fs.existsSync(envPath)) return {}

  try {
    return parseEnv(fs.readFileSync(envPath, 'utf8'))
  } catch {
    return {}
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

function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({ host, port }, () => {
      server.close(() => resolve(true))
    })
  })
}
