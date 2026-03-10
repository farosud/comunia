import { Bot } from 'grammy'

export async function detectGroupChatId(botToken: string): Promise<string | null> {
  return new Promise((resolve) => {
    const bot = new Bot(botToken)
    const timeout = setTimeout(() => {
      bot.stop()
      resolve(null)
    }, 60000) // 1 minute timeout

    bot.on('message', (ctx) => {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        clearTimeout(timeout)
        bot.stop()
        resolve(String(ctx.chat.id))
      }
    })

    console.log('Waiting for a message in a group chat (add bot to group and send a message)...')
    bot.start()
  })
}
