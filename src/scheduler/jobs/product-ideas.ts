import type { CronJob, JobContext } from './types.js'

export function createProductIdeasJob(schedule: string): CronJob {
  return {
    name: 'product-ideas',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      if (!ctx.productIdeas) {
        ctx.reason('product-ideas', 'detail', 'Skipping product ideas because the service is not available in this runtime')
        return
      }

      ctx.reason('product-ideas', 'step', 'Reviewing imported community signals for new product opportunities')
      await ctx.productIdeas.generateDailyIdea((level, message) => {
        ctx.reason('product-ideas', level, message)
      })
    },
  }
}
