import type { ToolDefinition } from './providers/types.js'
import type { EventManager } from '../events/manager.js'
import type { UserMemory } from '../memory/user-memory.js'
import type { GroupPolicy } from '../community/group-policy.js'

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'create_event',
      description: 'Create a draft community event (requires admin approval before announcing)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['dinner', 'party', 'zoom', 'meetup', 'asado', 'outdoor', 'other'] },
          date: { type: 'string', description: 'ISO date string' },
          location: { type: 'string' },
          maxCapacity: { type: 'number' },
          minCapacity: { type: 'number' },
          budget: { type: 'string', enum: ['free', 'low', 'medium', 'high'] },
          proposedBy: { type: 'string' },
        },
        required: ['title', 'type', 'date', 'proposedBy'],
      },
    },
    {
      name: 'rsvp_user',
      description: 'Record a user RSVP for an event',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          userId: { type: 'string' },
          status: { type: 'string', enum: ['yes', 'no', 'maybe'] },
        },
        required: ['eventId', 'userId', 'status'],
      },
    },
    {
      name: 'send_dm',
      description: 'Send a private message to a specific user',
      parameters: {
        type: 'object',
        properties: { userId: { type: 'string' }, message: { type: 'string' } },
        required: ['userId', 'message'],
      },
    },
    {
      name: 'send_group',
      description: 'Send a message to the community group chat',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
    {
      name: 'create_group_topic',
      description: 'Create a new Telegram forum topic in the community group when topic creation is enabled and the bot is an admin',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short topic title' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_user_memory',
      description: 'Store something learned about a user (preference, feedback, personality trait). Call this EVERY TIME you detect new info about a user.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          category: { type: 'string', enum: ['preferences', 'feedback', 'personality', 'availability', 'location', 'social'] },
          key: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'number', description: '0-1, how sure you are. Explicit=0.9+, inferred=0.4-0.7' },
        },
        required: ['userId', 'category', 'key', 'value'],
      },
    },
    {
      name: 'query_rsvps',
      description: 'Check who is attending an event',
      parameters: { type: 'object', properties: { eventId: { type: 'string' } }, required: ['eventId'] },
    },
    {
      name: 'cancel_event',
      description: 'Cancel an event and notify attendees',
      parameters: {
        type: 'object',
        properties: { eventId: { type: 'string' }, reason: { type: 'string' } },
        required: ['eventId', 'reason'],
      },
    },
    {
      name: 'score_event',
      description: 'Analyze and score a proposed event against community data. Returns score breakdown and estimated attendance.',
      parameters: { type: 'object', properties: { eventId: { type: 'string' } }, required: ['eventId'] },
    },
    {
      name: 'find_matching_members',
      description: 'Find members who would most enjoy a specific event, based on their profiles',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          minMatchScore: { type: 'number', description: '0-1 threshold' },
        },
        required: ['eventId'],
      },
    },
    {
      name: 'propose_event_idea',
      description: 'Create a draft event idea with reasoning (requires admin approval)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string' },
          date: { type: 'string' },
          location: { type: 'string' },
          reasoning: { type: 'string', description: 'Why this event would work for the community' },
        },
        required: ['title', 'type', 'date', 'reasoning'],
      },
    },
  ]
}

interface ToolContext {
  eventManager: EventManager
  userMemory: UserMemory
  sendDm: (userId: string, message: string) => Promise<void>
  sendGroup: (message: string, options?: { messageThreadId?: number }) => Promise<void>
  createGroupTopic?: (name: string) => Promise<{ messageThreadId: number; name: string }>
  groupPolicy?: GroupPolicy
}

export async function executeTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  switch (name) {
    case 'create_event':
    case 'propose_event_idea': {
      const event = await ctx.eventManager.create({
        title: input.title as string,
        type: input.type as string,
        proposedBy: (input.proposedBy as string) || 'agent',
        date: input.date as string,
        location: input.location as string | undefined,
        maxCapacity: input.maxCapacity as number | undefined,
        minCapacity: input.minCapacity as number | undefined,
        budget: input.budget as string | undefined,
      })
      return `Event created as draft: "${event.title}" (${event.id}). Awaiting admin approval.${input.reasoning ? ` Reasoning: ${input.reasoning}` : ''}`
    }
    case 'rsvp_user': {
      const resolvedUserId = await ctx.userMemory.resolveUserId(input.userId as string)
      const rsvp = await ctx.eventManager.rsvp(input.eventId as string, resolvedUserId, input.status as 'yes' | 'no' | 'maybe')
      return `RSVP recorded: ${rsvp.status}`
    }
    case 'send_dm': {
      await ctx.sendDm(input.userId as string, input.message as string)
      return `DM sent to ${input.userId}`
    }
    case 'send_group': {
      await ctx.sendGroup(input.message as string)
      return `Group message sent`
    }
    case 'create_group_topic': {
      const settings = await ctx.groupPolicy?.getSettings()
      if (!settings?.allowTelegramTopicCreation) {
        return 'Group topic creation is disabled in dashboard settings.'
      }
      if (!ctx.createGroupTopic) {
        return 'Telegram topic creation is not available in this runtime.'
      }
      const topic = await ctx.createGroupTopic(input.name as string)
      return `Created Telegram topic "${topic.name}" (thread ${topic.messageThreadId}).`
    }
    case 'update_user_memory': {
      await ctx.userMemory.set(
        input.userId as string, input.category as string, input.key as string,
        input.value as string, (input.confidence as number) || 0.7, 'inferred',
      )
      return `Memory updated: ${input.category}/${input.key} = ${input.value}`
    }
    case 'query_rsvps': {
      const rsvps = await ctx.eventManager.getRsvps(input.eventId as string)
      return `RSVPs: ${rsvps.map((r: any) => `${r.userId}: ${r.status}`).join(', ') || 'none yet'}`
    }
    case 'cancel_event': {
      const affected = await ctx.eventManager.cancel(input.eventId as string, input.reason as string)
      return `Event cancelled. ${affected.length} attendees to notify.`
    }
    case 'score_event':
      return `Score computation delegated to scoring engine (eventId: ${input.eventId})`
    case 'find_matching_members':
      return `Member matching delegated to scoring engine (eventId: ${input.eventId})`
    default:
      return `Unknown tool: ${name}`
  }
}
