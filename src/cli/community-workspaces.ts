import fs from 'fs'
import os from 'os'
import path from 'path'
import { parse as parseEnv } from 'dotenv'

export interface CommunityWorkspaceRecord {
  id: string
  name: string
  path: string
  createdAt: string
  lastStartedAt?: string
}

export interface CommunityWorkspaceOption extends CommunityWorkspaceRecord {
  isCurrent: boolean
}

export class CommunityWorkspaceStore {
  constructor(private baseDir: string = path.join(os.homedir(), '.comunia')) {}

  list(currentDir: string = process.cwd()): CommunityWorkspaceOption[] {
    const registry = this.readRegistry()
      .filter((entry) => this.isWorkspaceDir(entry.path))
      .map((entry) => ({ ...entry, name: this.readWorkspaceName(entry.path) || entry.name }))

    this.writeRegistry(registry)

    const currentPath = path.resolve(currentDir)
    const currentIsWorkspace = this.isWorkspaceDir(currentPath)
    const seen = new Set<string>()
    const options: CommunityWorkspaceOption[] = []

    for (const entry of registry) {
      const normalized = path.resolve(entry.path)
      seen.add(normalized)
      options.push({
        ...entry,
        path: normalized,
        isCurrent: normalized === currentPath,
      })
    }

    if (currentIsWorkspace && !seen.has(currentPath)) {
      const registered = this.register(currentPath)
      if (registered) {
        options.unshift({
          ...registered,
          path: currentPath,
          isCurrent: true,
        })
      }
    }

    return options.sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1
      if (!a.isCurrent && b.isCurrent) return 1
      return a.name.localeCompare(b.name)
    })
  }

  register(workspacePath: string): CommunityWorkspaceRecord | undefined {
    const resolved = path.resolve(workspacePath)
    if (!this.isWorkspaceDir(resolved)) return undefined

    const registry = this.readRegistry()
    const existing = registry.find((entry) => path.resolve(entry.path) === resolved)
    const now = new Date().toISOString()
    const name = this.readWorkspaceName(resolved) || path.basename(resolved)

    if (existing) {
      existing.name = name
      existing.path = resolved
      return this.persistAndReturn(registry, existing)
    }

    const created: CommunityWorkspaceRecord = {
      id: slugify(path.basename(resolved) || name || `community-${Date.now()}`),
      name,
      path: resolved,
      createdAt: now,
    }

    registry.push(created)
    return this.persistAndReturn(registry, created)
  }

  markStarted(workspacePath: string): CommunityWorkspaceRecord | undefined {
    const resolved = path.resolve(workspacePath)
    const registry = this.readRegistry()
    const entry = registry.find((item) => path.resolve(item.path) === resolved)
    if (!entry) return this.register(resolved)
    entry.lastStartedAt = new Date().toISOString()
    return this.persistAndReturn(registry, entry)
  }

  createManagedWorkspace(folderName: string): string {
    const root = this.getManagedRoot()
    fs.mkdirSync(root, { recursive: true })

    const baseSlug = slugify(folderName) || `community-${Date.now()}`
    let candidate = path.join(root, baseSlug)
    let suffix = 2

    while (fs.existsSync(candidate)) {
      candidate = path.join(root, `${baseSlug}-${suffix}`)
      suffix++
    }

    fs.mkdirSync(candidate, { recursive: true })
    return candidate
  }

  getManagedRoot(): string {
    return path.join(this.baseDir, 'communities')
  }

  private persistAndReturn(
    registry: CommunityWorkspaceRecord[],
    match: CommunityWorkspaceRecord,
  ): CommunityWorkspaceRecord {
    this.writeRegistry(registry)
    return { ...match }
  }

  private registryFile(): string {
    return path.join(this.baseDir, 'registry.json')
  }

  private readRegistry(): CommunityWorkspaceRecord[] {
    const file = this.registryFile()
    if (!fs.existsSync(file)) return []

    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private writeRegistry(entries: CommunityWorkspaceRecord[]) {
    fs.mkdirSync(this.baseDir, { recursive: true })
    fs.writeFileSync(this.registryFile(), JSON.stringify(entries, null, 2))
  }

  private isWorkspaceDir(workspacePath: string): boolean {
    return fs.existsSync(path.join(workspacePath, '.env')) &&
      fs.existsSync(path.join(workspacePath, 'agent', 'agent.md')) &&
      fs.existsSync(path.join(workspacePath, 'agent', 'soul.md'))
  }

  private readWorkspaceName(workspacePath: string): string | undefined {
    const envPath = path.join(workspacePath, '.env')
    if (!fs.existsSync(envPath)) return undefined

    try {
      const env = parseEnv(fs.readFileSync(envPath, 'utf8'))
      return env.COMMUNITY_NAME || path.basename(workspacePath)
    } catch {
      return path.basename(workspacePath)
    }
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
