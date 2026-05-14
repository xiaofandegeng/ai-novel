import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { chapters, chapterScenes } from './chapter'
import { novelProjects } from './project'
import { conflicts } from './structure'

export const conflictTimelineEvents = pgTable('conflict_timeline_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  conflictId: text('conflict_id').notNull().references(() => conflicts.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  intensityBefore: integer('intensity_before').notNull(),
  intensityAfter: integer('intensity_after').notNull(),
  statusBefore: text('status_before').notNull(),
  statusAfter: text('status_after').notNull(),
  reason: text('reason'),
  evidence: text('evidence'),
  sourceType: text('source_type').$type<'ai_extracted' | 'manual'>().notNull().default('manual'),
  ...timestamps,
})
