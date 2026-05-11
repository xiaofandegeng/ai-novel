import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { novelProjects } from './project'
import { volumes } from './structure'

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

export const chapterVersions = pgTable('chapter_versions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  wordCount: integer('word_count').notNull(),
  note: text('note'),
  createdAt: timestamps.createdAt,
})

export const chapterMemories = pgTable('chapter_memories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  keyEvents: text('key_events'),
  newFacts: text('new_facts'),
  characterStateChanges: text('character_state_changes'),
  relationshipChanges: text('relationship_changes'),
  conflictProgress: text('conflict_progress'),
  foreshadowingAdded: text('foreshadowing_added'),
  foreshadowingResolved: text('foreshadowing_resolved'),
  themeProgress: text('theme_progress'),
  styleNotes: text('style_notes'),
  ...timestamps,
}, table => ({
  projectChapterUnique: uniqueIndex('chapter_memories_project_chapter_unique')
    .on(table.projectId, table.chapterId),
}))

export const chapterScenes = pgTable('chapter_scenes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  sceneNumber: integer('scene_number').notNull(),
  title: text('title'),
  location: text('location'),
  timeline: text('timeline'),
  purpose: text('purpose'),
  summary: text('summary'),
  characters: text('characters'),
  targetWords: integer('target_words'),
  content: text('content'),
  orderIndex: integer('order_index').notNull(),
  status: text('status').$type<'planned' | 'drafting' | 'reviewed' | 'completed'>().notNull().default('planned'),
  conflict: text('conflict'),
  ...timestamps,
})

export const chapterPostprocessRuns = pgTable('chapter_postprocess_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  status: text('status').$type<'pending' | 'running' | 'completed' | 'failed'>().notNull().default('pending'),
  trigger: text('trigger').notNull(),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { mode: 'string' }),
  finishedAt: timestamp('finished_at', { mode: 'string' }),
  ...timestamps,
})
