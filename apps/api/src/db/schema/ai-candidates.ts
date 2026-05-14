import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { chapters } from './chapter'
import { novelProjects } from './project'

export const aiGenerationCandidates = pgTable('ai_generation_candidates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  contextSnapshotId: text('context_snapshot_id'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  taskType: text('task_type').notNull(),
  content: text('content').notNull(),
  qualityScore: integer('quality_score'),
  userSelected: integer('user_selected').notNull().default(0),
  userRating: integer('user_rating'),
  ...timestamps,
})
