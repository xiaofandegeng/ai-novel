import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { autonomousWritingRuns, writingJobs, writingJobSteps } from './ai'
import { chapterPostprocessRuns, chapters, chapterScenes } from './chapter'

import { characters } from './character'
import { novelProjects } from './project'

export const chapterElements = pgTable('chapter_elements', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  elementType: text('element_type').$type<'character' | 'location' | 'item' | 'organization' | 'event'>().notNull(),
  elementId: text('element_id'),
  elementName: text('element_name').notNull(),
  relationType: text('relation_type').$type<'appears' | 'mentioned' | 'scene' | 'uses' | 'involved' | 'occurs'>().notNull(),
  importance: text('importance').$type<'major' | 'normal' | 'minor'>().notNull().default('normal'),
  appearanceOrder: integer('appearance_order'),
  notes: text('notes'),
  ...timestamps,
}, table => ({
  elementUnique: uniqueIndex('chapter_elements_unique')
    .on(table.projectId, table.chapterId, table.elementType, table.elementName, table.relationType),
}))

export const chapterPostprocessSuggestions = pgTable('chapter_postprocess_suggestions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  runId: text('run_id').references(() => chapterPostprocessRuns.id, { onDelete: 'cascade' }),
  suggestionType: text('suggestion_type').$type<'fact_triple' | 'foreshadowing_add' | 'foreshadowing_payoff' | 'chapter_element' | 'character_add' | 'character_state' | 'conflict_add' | 'conflict_update' | 'continuity_note' | 'style_note' | 'relationship_update'>().notNull(),
  payload: text('payload').notNull(),
  confidence: integer('confidence').notNull().default(70),
  status: text('status').$type<'pending' | 'accepted' | 'rejected' | 'applied' | 'acknowledged' | 'apply_failed'>().notNull().default('pending'),
  reason: text('reason'),
  ...timestamps,
})

export const storyFactTriples = pgTable('story_fact_triples', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  subjectType: text('subject_type').notNull(),
  subjectName: text('subject_name').notNull(),
  predicate: text('predicate').notNull(),
  objectType: text('object_type').notNull(),
  objectName: text('object_name').notNull(),
  confidence: integer('confidence').notNull().default(70),
  sourceType: text('source_type').$type<'manual' | 'ai_extracted' | 'auto_inferred'>().notNull().default('manual'),
  sourceChapterId: text('source_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  status: text('status').$type<'pending' | 'confirmed' | 'rejected'>().notNull().default('pending'),
  relatedChapters: text('related_chapters'),
  notes: text('notes'),
  ...timestamps,
}, table => ({
  tripleUnique: uniqueIndex('story_fact_triples_unique')
    .on(table.projectId, table.subjectType, table.subjectName, table.predicate, table.objectType, table.objectName),
}))

export const foreshadowingItems = pgTable('foreshadowing_items', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  setupChapterId: text('setup_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  expectedPayoffChapterId: text('expected_payoff_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  payoffChapterId: text('payoff_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  status: text('status').$type<'open' | 'progressing' | 'paid_off' | 'abandoned'>().notNull().default('open'),
  importance: text('importance').$type<'major' | 'normal' | 'minor'>().notNull().default('normal'),
  relatedCharacters: text('related_characters'),
  characterIds: text('character_ids'),
  relatedEvents: text('related_events'),
  notes: text('notes'),
  ...timestamps,
})

export const foreshadowingCharacters = pgTable('foreshadowing_characters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  foreshadowingId: text('foreshadowing_id').notNull().references(() => foreshadowingItems.id, { onDelete: 'cascade' }),
  characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  relationType: text('relation_type').$type<'protagonist' | 'antagonist' | 'victim' | 'witness' | 'related'>().notNull().default('related'),
  ...timestamps,
}, table => ({
  foreshadowingCharacterUnique: uniqueIndex('foreshadowing_characters_unique')
    .on(table.projectId, table.foreshadowingId, table.characterId),
}))

export const chapterChangeSets = pgTable('chapter_change_sets', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  writingJobId: text('writing_job_id').references(() => writingJobs.id, { onDelete: 'set null' }),
  sourceStepId: text('source_step_id').references(() => writingJobSteps.id, { onDelete: 'set null' }),
  status: text('status').$type<
    'drafted'
    | 'reviewing'
    | 'approved'
    | 'applied'
    | 'blocked'
    | 'rejected'
    | 'apply_failed'
  >().notNull().default('drafted'),
  riskLevel: text('risk_level').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
  riskSummary: text('risk_summary'),
  draftTitle: text('draft_title'),
  draftContent: text('draft_content'),
  consistencyReportJson: jsonb('consistency_report_json'),
  extractedChangesJson: jsonb('extracted_changes_json').notNull().default({}),
  applyReportJson: jsonb('apply_report_json'),
  beforeSnapshotId: text('before_snapshot_id'),
  afterSnapshotId: text('after_snapshot_id'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  appliedAt: timestamp('applied_at', { mode: 'string' }),
})

export const chapterChangeSetItems = pgTable('chapter_change_set_items', {
  id: text('id').primaryKey(),
  changeSetId: text('change_set_id').notNull().references(() => chapterChangeSets.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  itemType: text('item_type').$type<
    'draft'
    | 'character_create'
    | 'character_update'
    | 'relationship_create'
    | 'relationship_update'
    | 'conflict_create'
    | 'conflict_update'
    | 'foreshadowing_create'
    | 'foreshadowing_payoff'
    | 'fact_create'
    | 'chapter_memory'
    | 'style_note'
    | 'continuity_note'
  >().notNull(),
  riskLevel: text('risk_level').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
  title: text('title').notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'applied' | 'blocked' | 'rejected' | 'apply_failed'>().notNull().default('pending'),
  applyError: text('apply_error'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
})

export const autonomousRunExceptions = pgTable('autonomous_run_exceptions', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => autonomousWritingRuns.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  changeSetId: text('change_set_id').references(() => chapterChangeSets.id, { onDelete: 'set null' }),
  writingJobId: text('writing_job_id').references(() => writingJobs.id, { onDelete: 'set null' }),
  stepId: text('step_id').references(() => writingJobSteps.id, { onDelete: 'set null' }),
  exceptionType: text('exception_type').$type<
    'consistency_blocked'
    | 'high_risk_change_set'
    | 'apply_failed'
    | 'ai_failed'
    | 'health_regression'
    | 'manual_required'
  >().notNull(),
  severity: text('severity').$type<'medium' | 'high' | 'critical'>().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').$type<'open' | 'resolved' | 'ignored'>().notNull().default('open'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
})
