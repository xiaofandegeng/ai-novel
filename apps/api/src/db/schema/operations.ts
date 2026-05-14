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
  key: text('key').notNull().unique(), // e.g. 'draft_generate'
  name: text('name').notNull(),
  description: text('description'),
  taskType: text('task_type'), // KEEPING
  version: text('version').notNull(),
  content: text('content'), // KEEPING
  systemPrompt: text('system_prompt'),
  userPromptTemplate: text('user_prompt_template'),
  variablesSchema: jsonb('variables_schema'), // KEEPING
  outputSchema: jsonb('output_schema'), // JSON schema for validation
  status: text('status').notNull().default('active'),
  ...timestamps,
})

export const projectPromptOverrides = pgTable('project_prompt_overrides', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  templateKey: text('template_key').notNull(),
  overrideSystemPrompt: text('override_system_prompt'),
  overrideUserPromptTemplate: text('override_user_prompt_template'),
  enabled: integer('enabled').notNull().default(1),
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

export const projectHealthReports = pgTable('project_health_reports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(), // overall, theme, character, plot, style
  score: integer('score').notNull(),
  riskLevel: text('risk_level').$type<'low' | 'medium' | 'high'>().notNull(),
  metricsJson: jsonb('metrics_json'), // 包含具体的指标证据和建议
  generatedAt: timestamp('generated_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})

export const chapterStyleFingerprints = pgTable('chapter_style_fingerprints', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  sentenceLengthAvg: integer('sentence_length_avg'),
  dialogueRatio: integer('dialogue_ratio'), // 0-100
  emotionDensity: integer('emotion_density'), // 0-100
  conflictDensity: integer('conflict_density'), // 0-100
  hookDensity: integer('hook_density'), // 0-100
  styleSummary: text('style_summary'),
  embeddingId: text('embedding_id'), // 关联 knowledge_embeddings
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})
