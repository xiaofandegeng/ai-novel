import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
}

export const novelProjects = pgTable('novel_projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  genre: text('genre'),
  theme: text('theme'),
  targetWords: integer('target_words'),
  targetAudience: text('target_audience'),
  styleProfile: text('style_profile'),
  status: text('status').notNull().default('planning'),
  ...timestamps,
})

export const storyBibles = pgTable('story_bibles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  worldview: text('worldview'),
  mainConflict: text('main_conflict'),
  theme: text('theme'),
  rules: text('rules'),
  timeline: text('timeline'),
  ...timestamps,
})

export const characters = pgTable('characters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role'),
  goal: text('goal'),
  fear: text('fear'),
  secret: text('secret'),
  desire: text('desire'),
  weakness: text('weakness'),
  personality: text('personality'),
  arc: text('arc'),
  ...timestamps,
})

export const volumes = pgTable('volumes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  orderIndex: integer('order_index').notNull(),
  ...timestamps,
})

export const chapters = pgTable('chapters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  volumeId: text('volume_id').references(() => volumes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  chapterNumber: integer('chapter_number').notNull(),
  outline: text('outline'),
  summary: text('summary'),
  characters: text('characters'),
  goals: text('goals'),
  conflicts: text('conflicts'),
  events: text('events'),
  emotionalArc: text('emotional_arc'),
  foreshadowing: text('foreshadowing'),
  endingHook: text('ending_hook'),
  draft: text('draft'),
  status: text('status').$type<'not_started' | 'planning' | 'writing' | 'completed'>().notNull().default('not_started'),
  ...timestamps,
})

export const characterRelationships = pgTable('character_relationships', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  characterAId: text('character_a_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  characterBId: text('character_b_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  strength: integer('strength').notNull().default(1),
  status: text('status'),
  description: text('description'),
  ...timestamps,
})

export const chapterVersions = pgTable('chapter_versions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  wordCount: integer('word_count').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const conflicts = pgTable('conflicts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').$type<'internal' | 'external'>().notNull(),
  intensity: integer('intensity').notNull().default(1),
  status: text('status').$type<'latent' | 'forming' | 'escalating' | 'exploding' | 'resolved' | 'abandoned'>().notNull().default('latent'),
  participants: text('participants'),
  description: text('description'),
  resolution: text('resolution'),
  ...timestamps,
})

export const knowledgeSources = pgTable('knowledge_sources', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  author: text('author'),
  sourceType: text('source_type').$type<'classic' | 'reference' | 'personal'>().notNull(),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  status: text('status').$type<'pending' | 'processing' | 'completed' | 'failed'>().notNull().default('pending'),
  ...timestamps,
})

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chunkType: text('chunk_type').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  summary: text('summary'),
  techniques: text('techniques'),
  orderIndex: integer('order_index').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const knowledgeNotes = pgTable('knowledge_notes', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const qualityReports = pgTable('quality_reports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
  scope: text('scope').$type<'chapter' | 'book'>().notNull(),
  score: integer('score').notNull(),
  rhythmScore: integer('rhythm_score'),
  conflictScore: integer('conflict_score'),
  logicScore: integer('logic_score'),
  characterScore: integer('character_score'),
  styleScore: integer('style_score'),
  issues: text('issues'),
  suggestions: text('suggestions'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const aiSettings = pgTable('ai_settings', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull().default('openai-compatible'),
  baseUrl: text('base_url').notNull().default('https://api.openai.com/v1'),
  model: text('model').notNull().default('gpt-4o-mini'),
  apiKey: text('api_key'),
  temperature: integer('temperature').notNull().default(70),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})
