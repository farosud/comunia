import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  telegramId: text('telegram_id').unique(),
  whatsappId: text('whatsapp_id').unique(),
  name: text('name').notNull(),
  preferredName: text('preferred_name'),
  joinedAt: text('joined_at').notNull(),
  lastActiveAt: text('last_active_at').notNull(),
  status: text('status').notNull().default('active'),
})

export const userMemory = sqliteTable('user_memory', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  category: text('category').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  confidence: real('confidence').notNull().default(0.5),
  source: text('source').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  status: text('status').notNull().default('draft'),
  proposedBy: text('proposed_by').notNull(),
  date: text('date').notNull(),
  location: text('location'),
  maxCapacity: integer('max_capacity'),
  minCapacity: integer('min_capacity'),
  budget: text('budget'),
  score: real('score'),
  scoreBreakdown: text('score_breakdown'),
  agentNotes: text('agent_notes'),
  createdAt: text('created_at').notNull(),
})

export const rsvps = sqliteTable('rsvps', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status').notNull(),
  respondedAt: text('responded_at').notNull(),
})

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  userId: text('user_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  text: text('text'),
  collectedAt: text('collected_at').notNull(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  platform: text('platform').notNull(),
  chatType: text('chat_type').notNull(),
  summary: text('summary'),
  lastMessageAt: text('last_message_at').notNull(),
})

export const research = sqliteTable('research', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  eventType: text('event_type'),
  data: text('data').notNull(),
  source: text('source'),
  researchedAt: text('researched_at').notNull(),
  expiresAt: text('expires_at'),
})

export const importLog = sqliteTable('import_log', {
  id: text('id').primaryKey(),
  sourceFile: text('source_file').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('completed'),
  error: text('error'),
  messagesProcessed: integer('messages_processed').default(0),
  membersProcessed: integer('members_processed').default(0),
  entriesExtracted: integer('entries_extracted').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
  importedAt: text('imported_at').notNull(),
})

export const communitySettings = sqliteTable('community_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const communityIdeas = sqliteTable('community_ideas', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  format: text('format').notNull(),
  rationale: text('rationale'),
  source: text('source').notNull().default('agent'),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
})

export const productIdeas = sqliteTable('product_ideas', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  targetMembers: text('target_members'),
  rationale: text('rationale'),
  buildPrompt: text('build_prompt').notNull(),
  source: text('source').notNull().default('agent'),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
})

export const communityIdeaVotes = sqliteTable('community_idea_votes', {
  id: text('id').primaryKey(),
  ideaId: text('idea_id').notNull().references(() => communityIdeas.id),
  voterId: text('voter_id').notNull(),
  value: integer('value').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  ideaVoterUnique: uniqueIndex('community_idea_votes_idea_voter_unique').on(table.ideaId, table.voterId),
}))

export const publishedPortals = sqliteTable('published_portals', {
  slug: text('slug').primaryKey(),
  communityName: text('community_name').notNull(),
  snapshot: text('snapshot').notNull(),
  passcode: text('passcode').notNull(),
  botUrl: text('bot_url'),
  publishedAt: text('published_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const cloudPublishCredentials = sqliteTable('cloud_publish_credentials', {
  slug: text('slug').primaryKey(),
  token: text('token').notNull(),
  communityName: text('community_name'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const publishedIdeaVotes = sqliteTable('published_idea_votes', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().references(() => publishedPortals.slug),
  ideaId: text('idea_id').notNull(),
  voterId: text('voter_id').notNull(),
  value: integer('value').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  portalIdeaVoterUnique: uniqueIndex('published_idea_votes_slug_idea_voter_unique').on(table.slug, table.ideaId, table.voterId),
}))
