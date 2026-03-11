import type { CronJob } from './types.js'

export function createTelegramMemberSyncJob(schedule: string): CronJob {
  return {
    name: 'telegram-member-sync',
    schedule,
    enabled: true,
    run: async (ctx) => {
      if (!ctx.telegramMemberSync) {
        ctx.reason('telegram-member-sync', 'detail', 'Telegram member sync skipped because Telegram is not configured.')
        return
      }

      await ctx.telegramMemberSync.syncKnownMembers()
    },
  }
}
