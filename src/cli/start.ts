import * as p from '@clack/prompts'
import fs from 'fs'
import path from 'path'
import { parse as parseEnv } from 'dotenv'
import process from 'process'
import { CommunityWorkspaceStore } from './community-workspaces.js'

export async function runStart() {
  const store = new CommunityWorkspaceStore()
  const known = store.list(process.cwd())
  const options: Array<{
    value: { type: 'existing'; workspace: (typeof known)[number] } | { type: 'new' }
    label: string
    hint?: string
  }> = [
    ...known.map((workspace) => ({
      value: { type: 'existing' as const, workspace },
      label: workspace.name + (workspace.isCurrent ? ' (current directory)' : ''),
      hint: workspace.path,
    })),
    {
      value: { type: 'new' as const },
      label: 'Create new community',
      hint: 'Creates a fresh isolated workspace',
    },
  ]

  p.intro('comunia launcher')

  const choice = await p.select({
    message: known.length > 0
      ? 'Choose a community workspace to launch, or create a new one:'
      : 'No community workspace found yet. Create one now?',
    options: options as any,
  }) as { type: 'existing'; workspace: (typeof known)[number] } | { type: 'new' }

  if (p.isCancel(choice)) return process.exit(0)

  if (choice.type === 'new') {
    const folder = await p.text({
      message: 'Workspace folder name:',
      placeholder: 'my-community',
      validate: (value) => value && value.trim() ? undefined : 'Folder name is required',
    })
    if (p.isCancel(folder)) return process.exit(0)

    const workspaceDir = store.createManagedWorkspace(folder.trim())
    p.note(
      `New community workspace:\n${workspaceDir}\n\nEverything for this community will live in this folder.`,
      'Workspace Created',
    )
    process.chdir(workspaceDir)
    const { runInit } = await import('./init.js')
    await runInit()
    return
  }

  store.markStarted(choice.workspace.path)
  process.chdir(choice.workspace.path)
  const env = readWorkspaceEnv(choice.workspace.path)
  const dashboardHost = env.DASHBOARD_HOST || '127.0.0.1'
  const dashboardPort = env.DASHBOARD_PORT || '3000'
  p.note(
    `Launching ${choice.workspace.name}\n${choice.workspace.path}\n\n` +
    `Dashboard URL: http://${dashboardHost}:${dashboardPort}\n` +
    `Dashboard secret: ${env.DASHBOARD_SECRET || 'Not found in .env'}\n\n` +
    `Each workspace has its own dashboard, public site, agent files, and data.`,
    'Starting Community',
  )

  const { startApp } = await import('../index.js')
  await startApp()
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
