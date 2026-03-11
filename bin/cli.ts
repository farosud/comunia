#!/usr/bin/env node

const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'init': {
    const { runInit } = await import('../src/cli/init.js')
    await runInit()
    break
  }
  case 'start': {
    const { runStart } = await import('../src/cli/start.js')
    await runStart()
    break
  }
  case 'import': {
    const { runImport } = await import('../src/cli/import-cmd.js')
    await runImport(args[1])
    break
  }
  case 'publish': {
    const { runPublish } = await import('../src/cli/publish.js')
    await runPublish()
    break
  }
  case 'cloud-register': {
    const { runCloudRegister } = await import('../src/cli/cloud-register.js')
    await runCloudRegister()
    break
  }
  default:
    console.log(`
comunia - AI Community Manager

Commands:
  init          Interactive setup wizard
  start         Launch a community workspace or create a new one
  import [file] Import community history data
  publish       Publish the public portal to Comunia Cloud
  cloud-register Claim a Comunia Cloud slug and store its publish token locally

Usage:
  npx comunia init
  npx comunia start
  npx comunia import
  npx comunia import ./chat-export.txt
  npx comunia publish
  npx comunia cloud-register
`)
}
