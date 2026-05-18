import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { chapters, chapterScenes } from './chapter'
import { novelProjects } from './project'

export const writingJobs = pgTable('writing_jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  currentChapterId: text('current_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  mode: text('mode').$type<'outline_only' | 'draft_only' | 'outline_then_draft' | 'scene_draft'>().notNull(),
  status: text('status').$type<'idle' | 'running' | 'waiting_review' | 'paused' | 'completed' | 'failed' | 'isolated'>().notNull().default('idle'),
  executionMode: text('execution_mode').$type<'manual' | 'auto'>().notNull().default('manual'),
  autoApprovalLevel: text('auto_approval_level').$type<'conservative' | 'balanced' | 'aggressive'>().notNull().default('conservative'),
  autoStopReason: text('auto_stop_reason'),
  autoApprovedSteps: integer('auto_approved_steps').notNull().default(0),
  targetWords: integer('target_words'),
  lastError: text('last_error'),
  autonomousRunId: text('autonomous_run_id'),
  ...timestamps,
})

export const writingJobSteps = pgTable('writing_job_steps', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => writingJobs.id, { onDelete: 'cascade' }),
  stepType: text('step_type').$type<'prepare_context' | 'generate_plan' | 'confirm_plan' | 'generate_draft' | 'generate_scene_draft' | 'consistency_check' | 'confirm_apply' | 'apply_draft' | 'save_version' | 'postprocess' | 'confirm_suggestions' | 'apply_suggestions' | 'update_health' | 'build_change_set' | 'review_change_set' | 'apply_change_set' | 'auto_repair' | 'done'>().notNull(),
  status: text('status').$type<'pending' | 'running' | 'completed' | 'failed' | 'skipped'>().notNull().default('pending'),
  reviewRequired: boolean('review_required').notNull().default(false),
  autoDecision: text('auto_decision').$type<'approved' | 'paused' | 'rejected' | 'not_applicable' | 'medium_risk_repair' | 'repaired' | 'isolated' | 'skipped' | 'failed'>(),
  autoRiskLevel: text('auto_risk_level').$type<'none' | 'low' | 'medium' | 'high' | 'critical'>(),
  autoDecisionReason: text('auto_decision_reason'),
  autoDecisionReport: jsonb('auto_decision_report'),
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

export const autonomousWritingRuns = pgTable('autonomous_writing_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  status: text('status').$type<
    'idle'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'needs_attention'
  >().notNull().default('idle'),
  strategy: text('strategy').$type<'safe' | 'balanced' | 'fast'>().notNull().default('balanced'),
  scopeType: text('scope_type').$type<'project' | 'volume' | 'chapter_range' | 'next_n_chapters' | 'from_current_forward' | 'continue_incomplete' | 'rewrite_selected'>().notNull(),
  volumeId: text('volume_id'),
  startChapterId: text('start_chapter_id'),
  endChapterId: text('end_chapter_id'),
  targetChapterCount: integer('target_chapter_count'),
  targetWordsPerChapter: integer('target_words_per_chapter').notNull().default(3000),
  currentChapterId: text('current_chapter_id'),
  completedChapterCount: integer('completed_chapter_count').notNull().default(0),
  failedChapterCount: integer('failed_chapter_count').notNull().default(0),
  pausedReason: text('paused_reason'),
  lastError: text('last_error'),
  startedAt: timestamp('started_at', { mode: 'string' }),
  finishedAt: timestamp('finished_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
})

export const autonomousRunJobs = pgTable('autonomous_run_jobs', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => autonomousWritingRuns.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  writingJobId: text('writing_job_id').notNull().references(() => writingJobs.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  status: text('status').$type<'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_review' | 'isolated'>().notNull().default('pending'),
  orderIndex: integer('order_index').notNull(),
  isolationReason: text('isolation_reason'),
  isolationReport: jsonb('isolation_report'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
})
