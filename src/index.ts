import { loadConfig } from './config.js'

async function main() {
  const config = loadConfig()
  console.log(`🦞 comunia v0.1.0`)
  console.log(`Community: ${config.community.name}`)
}

main().catch(console.error)
