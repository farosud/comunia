import cron from 'node-cron'
import type { CronJob, JobContext } from './jobs/types.js'
import { createReminderJob } from './jobs/reminders.js'
import { createFeedbackJob } from './jobs/feedback.js'
import { createReflectionJob } from './jobs/reflection.js'
import { createDigestJob } from './jobs/digest.js'
import { createReengagementJob } from './jobs/reengagement.js'
import { createVenueResearchJob } from './jobs/venue-research.js'
import { createEventIdeationJob } from './jobs/event-ideation.js'
import { createSubgroupAnalysisJob } from './jobs/subgroup-analysis.js'
import { createProfileEnrichmentJob } from './jobs/profile-enrichment.js'
import { createTelegramMemberSyncJob } from './jobs/member-sync.js'
import { createCommunityIdeasJob } from './jobs/community-ideas.js'
import type { Config } from '../config.js'

export class Scheduler {
  private jobs: CronJob[] = []
  private tasks: cron.ScheduledTask[] = []

  constructor(config: Config) {
    this.jobs = [
      createReminderJob(config.scheduler.reminderHoursBefore),
      createFeedbackJob(config.scheduler.feedbackDelayHours),
      createReflectionJob(config.scheduler.reflectionCron),
      createDigestJob(config.scheduler.digestCron),
      createReengagementJob(),
      createVenueResearchJob(config.scheduler.venueResearchCron),
      createEventIdeationJob(config.scheduler.eventIdeationCron),
      createSubgroupAnalysisJob(config.scheduler.subgroupAnalysisCron),
      createProfileEnrichmentJob(),
      createTelegramMemberSyncJob(config.scheduler.memberSyncCron),
      createCommunityIdeasJob(config.scheduler.communityIdeaCron),
    ]
  }

  async start(ctx: JobContext): Promise<void> {
    const reason = (jobName: string, level: string, message: string, data?: Record<string, unknown>) => {
      ctx.reasoning.emit_reasoning({ jobName, level: level as any, message, data })
    }

    for (const job of this.jobs) {
      if (!job.enabled) continue

      const task = cron.schedule(job.schedule, async () => {
        try {
          await job.run({ ...ctx, reason })
        } catch (err) {
          reason(job.name, 'step', `Job failed: ${err}`)
        }
      })

      this.tasks.push(task)
      console.log(`Scheduled job: ${job.name} (${job.schedule})`)

      if (job.name === 'community-ideas') {
        try {
          await job.run({ ...ctx, reason })
        } catch (err) {
          reason(job.name, 'step', `Initial run failed: ${err}`)
        }
      }
    }

    // Keep the scheduler alive
    await new Promise(() => {})
  }

  stop() {
    for (const task of this.tasks) {
      task.stop()
    }
    this.tasks = []
  }

  getJobs(): { name: string; schedule: string; enabled: boolean }[] {
    return this.jobs.map(j => ({ name: j.name, schedule: j.schedule, enabled: j.enabled }))
  }
}
