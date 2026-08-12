import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'

export const projectReadModels = pgTable('project_read_models', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  genre: text('genre'),
  theme: text('theme'),
  targetWords: integer('target_words'),
  targetAudience: text('target_audience'),
  styleProfile: text('style_profile'),
  status: text('status').notNull(),
  ...timestamps,
})
