#!/usr/bin/env node

const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'init': {
    const { runInit } = await import('../src/cli/init.js')
    await runInit()
    break
  }
  case 'import': {
    const { runImport } = await import('../src/cli/import-cmd.js')
    await runImport(args[1])
    break
  }
  default:
    console.log(`
comunia - AI Community Manager

Commands:
  init          Interactive setup wizard
  import [file] Import community history data

Usage:
  npx comunia init
  npx comunia import
  npx comunia import ./chat-export.txt
`)
}
