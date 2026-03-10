import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

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
  messagesProcessed: integer('messages_processed').default(0),
  membersProcessed: integer('members_processed').default(0),
  entriesExtracted: integer('entries_extracted').default(0),
  importedAt: text('imported_at').notNull(),
})
