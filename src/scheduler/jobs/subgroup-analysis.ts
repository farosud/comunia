import type { CronJob, JobContext } from './types.js'
import { users, userMemory } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

export function createSubgroupAnalysisJob(schedule: string): CronJob {
  return {
    name: 'subgroup-analysis',
    schedule,
    enabled: true,
    async run(ctx: JobContext) {
      ctx.reason('subgroups', 'step', 'Starting member cluster analysis')

      const allUsers = ctx.db.select().from(users).where(eq(users.status, 'active')).all()
      const profiles: Record<string, any[]> = {}

      for (const user of allUsers) {
        const mem = ctx.db.select().from(userMemory).where(eq(userMemory.userId, user.id)).all()
        profiles[user.id] = mem
      }

      ctx.reason('subgroups', 'detail', `Analyzing profiles of ${allUsers.length} members`)

      const response = await ctx.llm.chat(
        `Analyze these community member profiles and identify 2-4 subgroups based on shared interests, location, or availability.

Members and their profiles:
${allUsers.map((u: any) => `${u.name}: ${(profiles[u.id] || []).map((m: any) => `${m.key}=${m.value}`).join(', ') || 'no profile data'}`).join('\n')}

Return as JSON: { "clusters": [{ "name": "...", "members": ["user_id"], "commonInterests": ["..."], "suggestedEventType": "..." }] }`,
        [{ role: 'user', content: 'Identify member clusters.' }],
      )

      try {
        const result = JSON.parse(response.text)
        for (const cluster of result.clusters || []) {
          ctx.reason('subgroups', 'correlation',
            `Cluster "${cluster.name}": ${cluster.members?.length || 0} members, interests: ${cluster.commonInterests?.join(', ')}`,
            { cluster })
        }
        ctx.reason('subgroups', 'decision', `Identified ${(result.clusters || []).length} member clusters`)
      } catch {
        ctx.reason('subgroups', 'step', 'Failed to parse cluster analysis')
      }
    },
  }
}
