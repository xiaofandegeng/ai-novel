import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'

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

export const aiSettings = pgTable('ai_settings', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull().default('openai-compatible'),
  baseUrl: text('base_url').notNull().default('https://api.openai.com/v1'),
  model: text('model').notNull().default('gpt-4o-mini'),
  apiKey: text('api_key'),
  temperature: integer('temperature').notNull().default(70),

  embeddingProvider: text('embedding_provider'),
  embeddingBaseUrl: text('embedding_base_url'),
  embeddingModel: text('embedding_model'),
  embeddingApiKey: text('embedding_api_key'),
  embeddingEnabled: boolean('embedding_enabled').default(true),

  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
})
