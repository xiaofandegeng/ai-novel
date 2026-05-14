import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { novelProjects } from './project'

export const writingGoals = pgTable('writing_goals', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  goalType: text('goal_type').$type<'daily_words' | 'weekly_words' | 'chapters' | 'completion_date'>().notNull(),
  targetWords: integer('target_words'),
  targetChapters: integer('target_chapters'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  status: text('status').$type<'active' | 'completed' | 'abandoned'>().notNull().default('active'),
  ...timestamps,
})

export const dailyWritingStats = pgTable('daily_writing_stats', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  wordsAdded: integer('words_added').notNull().default(0),
  chaptersCompleted: integer('chapters_completed').notNull().default(0),
  aiWordsAccepted: integer('ai_words_accepted').notNull().default(0),
  manualWordsAdded: integer('manual_words_added').notNull().default(0),
  createdAt: timestamps.createdAt,
}, table => ({
  projectDateUnique: uniqueIndex('daily_writing_stats_project_date_unique')
    .on(table.projectId, table.date),
}))
