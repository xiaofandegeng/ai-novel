import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { chapters, chapterScenes } from './chapter'
import { novelProjects } from './project'

export const writingJobs = pgTable('writing_jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  currentChapterId: text('current_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  mode: text('mode').$type<'outline_only' | 'draft_only' | 'outline_then_draft' | 'scene_draft'>().notNull(),
  status: text('status').$type<'idle' | 'running' | 'waiting_review' | 'paused' | 'completed' | 'failed'>().notNull().default('idle'),
  executionMode: text('execution_mode').$type<'manual' | 'auto'>().notNull().default('manual'),
  autoApprovalLevel: text('auto_approval_level').$type<'conservative' | 'balanced' | 'aggressive'>().notNull().default('conservative'),
  autoStopReason: text('auto_stop_reason'),
  autoApprovedSteps: integer('auto_approved_steps').notNull().default(0),
  lastError: text('last_error'),
  ...timestamps,
})

export const writingJobSteps = pgTable('writing_job_steps', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => writingJobs.id, { onDelete: 'cascade' }),
  stepType: text('step_type').$type<'prepare_context' | 'generate_plan' | 'confirm_plan' | 'generate_draft' | 'generate_scene_draft' | 'consistency_check' | 'confirm_apply' | 'apply_draft' | 'save_version' | 'postprocess' | 'confirm_suggestions' | 'apply_suggestions' | 'update_health' | 'build_change_set' | 'review_change_set' | 'apply_change_set' | 'done'>().notNull(),
  status: text('status').$type<'pending' | 'running' | 'completed' | 'failed' | 'skipped'>().notNull().default('pending'),
  reviewRequired: boolean('review_required').notNull().default(false),
  autoDecision: text('auto_decision').$type<'approved' | 'paused' | 'rejected' | 'not_applicable'>(),
  autoDecisionReason: text('auto_decision_reason'),
  input: text('input'),
  output: text('output'),
  error: text('error'),
  changeSetId: text('change_set_id'),
  startedAt: timestamp('started_at', { mode: 'string' }),
  finishedAt: timestamp('finished_at', { mode: 'string' }),
  ...timestamps,
})

export const aiContextSnapshots = pgTable('ai_context_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
  scene: text('scene'),
  requestId: text('request_id').notNull(),
  modelProvider: text('model_provider'),
  modelName: text('model_name'),
  contextPayload: text('context_payload'),
  renderedPromptPreview: text('rendered_prompt_preview'),
  tokenEstimate: integer('token_estimate'),
  createdAt: timestamps.createdAt,
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
  createdAt: timestamps.createdAt,
})
