import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const novelProjects = sqliteTable('novel_projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  genre: text('genre'),
  theme: text('theme'),
  targetWords: integer('target_words'),
  targetAudience: text('target_audience'),
  styleProfile: text('style_profile'),
  status: text('status').notNull().default('planning'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const storyBibles = sqliteTable('story_bibles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  worldview: text('worldview'),
  mainConflict: text('main_conflict'),
  theme: text('theme'),
  rules: text('rules'),
  timeline: text('timeline'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const characters = sqliteTable('characters', {
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
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const volumes = sqliteTable('volumes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  orderIndex: integer('order_index').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  volumeId: text('volume_id').references(() => volumes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  chapterNumber: integer('chapter_number').notNull(),
  outline: text('outline'),
  summary: text('summary'),
  characters: text('characters'), // JSON string of character IDs
  goals: text('goals'),
  conflicts: text('conflicts'),
  events: text('events'),
  emotionalArc: text('emotional_arc'),
  foreshadowing: text('foreshadowing'),
  endingHook: text('ending_hook'),
  draft: text('draft'),
  status: text('status').$type<'not_started' | 'planning' | 'writing' | 'completed'>().notNull().default('not_started'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const characterRelationships = sqliteTable('character_relationships', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  characterAId: text('character_a_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  characterBId: text('character_b_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // e.g., 'enemy', 'lover', 'ally'
  strength: integer('strength').notNull().default(1), // 1-10
  status: text('status'), // Current status in story
  description: text('description'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const chapterVersions = sqliteTable('chapter_versions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  wordCount: integer('word_count').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const conflicts = sqliteTable('conflicts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').$type<'internal' | 'external'>().notNull(),
  intensity: integer('intensity').notNull().default(1),
  status: text('status').$type<'latent' | 'forming' | 'escalating' | 'exploding' | 'resolved' | 'abandoned'>().notNull().default('latent'),
  participants: text('participants'), // JSON string of character IDs
  description: text('description'),
  resolution: text('resolution'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// Knowledge Base Enhancement
export const knowledgeSources = sqliteTable('knowledge_sources', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  author: text('author'),
  sourceType: text('source_type').$type<'classic' | 'reference' | 'personal'>().notNull(),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  status: text('status').$type<'pending' | 'processing' | 'completed' | 'failed'>().notNull().default('pending'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const knowledgeChunks = sqliteTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chunkType: text('chunk_type').notNull(), // e.g., 'chapter', 'scene'
  title: text('title'),
  content: text('content').notNull(),
  summary: text('summary'),
  techniques: text('techniques'), // AI-extracted writing techniques
  orderIndex: integer('order_index').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const knowledgeNotes = sqliteTable('knowledge_notes', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags'), // JSON string of tags
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const qualityReports = sqliteTable('quality_reports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }), // null for full book report
  scope: text('scope').$type<'chapter' | 'book'>().notNull(),
  score: integer('score').notNull(),
  rhythmScore: integer('rhythm_score'),
  conflictScore: integer('conflict_score'),
  logicScore: integer('logic_score'),
  characterScore: integer('character_score'),
  styleScore: integer('style_score'),
  issues: text('issues'), // JSON array of strings
  suggestions: text('suggestions'), // JSON array of strings
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})
