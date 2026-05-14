import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { aiContextSnapshots } from './ai'
import { chapters } from './chapter'
import { novelProjects } from './project'

export const authoringEvents = pgTable('authoring_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id'),
  eventType: text('event_type').notNull(),
  source: text('source').notNull(), // manual, ai, system, task, smoke
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const aiQualityFeedback = pgTable('ai_quality_feedback', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id'),
  contextSnapshotId: text('context_snapshot_id').references(() => aiContextSnapshots.id, { onDelete: 'set null' }),
  modelProvider: text('model_provider').notNull(),
  modelName: text('model_name').notNull(),
  taskType: text('task_type').notNull(),
  ratingOverall: integer('rating_overall').notNull(),
  ratingConsistency: integer('rating_consistency'),
  ratingCharacter: integer('rating_character'),
  ratingPlot: integer('rating_plot'),
  ratingStyle: integer('rating_style'),
  ratingUsefulness: integer('rating_usefulness'),
  issueTags: jsonb('issue_tags'), // array of strings
  comment: text('comment'),
  accepted: integer('accepted').notNull().default(0), // 0: no, 1: yes
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const promptTemplates = pgTable('prompt_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  taskType: text('task_type').notNull(),
  version: text('version').notNull(),
  content: text('content').notNull(),
  variablesSchema: jsonb('variables_schema'),
  status: text('status').notNull().default('active'),
  ...timestamps,
})

export const promptTemplateRuns = pgTable('prompt_template_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  contextSnapshotId: text('context_snapshot_id').references(() => aiContextSnapshots.id, { onDelete: 'set null' }),
  templateId: text('template_id').notNull().references(() => promptTemplates.id),
  templateVersion: text('template_version').notNull(),
  renderedPreview: text('rendered_preview'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const aiUsageRecords = pgTable('ai_usage_records', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  contextSnapshotId: text('context_snapshot_id').references(() => aiContextSnapshots.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  taskType: text('task_type').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  estimatedCost: text('estimated_cost'),
  latencyMs: integer('latency_ms').notNull().default(0),
  status: text('status').notNull(), // success, error
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})
