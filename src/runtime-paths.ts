import path from 'path'
import { fileURLToPath } from 'url'

export function resolveFromModule(metaUrl: string, ...segments: string[]) {
  const moduleDir = path.dirname(fileURLToPath(metaUrl))
  return path.resolve(moduleDir, ...segments)
}
