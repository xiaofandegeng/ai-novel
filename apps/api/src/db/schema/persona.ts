import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { novelProjects } from './project'

export const referenceTrainingSets = pgTable('reference_training_sets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  genre: text('genre'),
  targetPersonaType: text('target_persona_type'),
  status: text('status').$type<'draft' | 'analyzing' | 'ready' | 'failed'>().notNull().default('draft'),
  ...timestamps,
})

export const referenceWorks = pgTable('reference_works', {
  id: text('id').primaryKey(),
  trainingSetId: text('training_set_id').notNull().references(() => referenceTrainingSets.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  author: text('author'),
  sourceType: text('source_type').$type<'webnovel' | 'reference' | 'sample'>().notNull().default('webnovel'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  wordCount: integer('word_count'),
  chapterCount: integer('chapter_count'),
  status: text('status').$type<'uploaded' | 'splitting' | 'analyzing' | 'completed' | 'partial_failed' | 'failed'>().notNull().default('uploaded'),
  ...timestamps,
})

export const referenceChapters = pgTable('reference_chapters', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull().references(() => referenceWorks.id, { onDelete: 'cascade' }),
  trainingSetId: text('training_set_id').notNull().references(() => referenceTrainingSets.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  chapterNumber: integer('chapter_number').notNull(),
  content: text('content').notNull(),
  wordCount: integer('word_count').notNull(),
  createdAt: timestamps.createdAt,
})

export const chapterAnalyses = pgTable('chapter_analyses', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull().references(() => referenceChapters.id, { onDelete: 'cascade' }),
  workId: text('work_id').notNull().references(() => referenceWorks.id, { onDelete: 'cascade' }),
  trainingSetId: text('training_set_id').notNull().references(() => referenceTrainingSets.id, { onDelete: 'cascade' }),
  openingHook: text('opening_hook'),
  conflictType: text('conflict_type'),
  pressureSource: text('pressure_source'),
  protagonistAction: text('protagonist_action'),
  payoffType: text('payoff_type'),
  cliffhanger: text('cliffhanger'),
  emotionCurve: text('emotion_curve'),
  pacingScore: integer('pacing_score'),
  dialogueRatio: integer('dialogue_ratio'),
  descriptionRatio: integer('description_ratio'),
  narrativePattern: text('narrative_pattern'),
  tropeTags: text('trope_tags'),
  craftNotes: text('craft_notes'),
  riskNotes: text('risk_notes'),
  createdAt: timestamps.createdAt,
})

export const referenceChapterAnalysisErrors = pgTable('reference_chapter_analysis_errors', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull().references(() => referenceChapters.id, { onDelete: 'cascade' }),
  workId: text('work_id').notNull().references(() => referenceWorks.id, { onDelete: 'cascade' }),
  trainingSetId: text('training_set_id').notNull().references(() => referenceTrainingSets.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  createdAt: timestamps.createdAt,
})

export const workStyleReports = pgTable('work_style_reports', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull().references(() => referenceWorks.id, { onDelete: 'cascade' }),
  trainingSetId: text('training_set_id').notNull().references(() => referenceTrainingSets.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  coreAppeal: text('core_appeal'),
  pacingModel: text('pacing_model'),
  hookModel: text('hook_model'),
  conflictModel: text('conflict_model'),
  characterModel: text('character_model'),
  languageProfile: text('language_profile'),
  chapterTemplate: text('chapter_template'),
  strengths: text('strengths'),
  weaknesses: text('weaknesses'),
  avoidCopying: text('avoid_copying'),
  createdAt: timestamps.createdAt,
})

export const writingPersonas = pgTable('writing_personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  genre: text('genre'),
  sourceTrainingSetId: text('source_training_set_id').references(() => referenceTrainingSets.id),
  status: text('status').$type<'draft' | 'published' | 'archived'>().notNull().default('draft'),
  coreAppeal: text('core_appeal'),
  pacingRules: text('pacing_rules'),
  conflictRules: text('conflict_rules'),
  characterRules: text('character_rules'),
  languageRules: text('language_rules'),
  chapterRules: text('chapter_rules'),
  hookRules: text('hook_rules'),
  forbiddenRules: text('forbidden_rules'),
  similarityGuardrails: text('similarity_guardrails'),
  ...timestamps,
})

export const projectPersonaConfigs = pgTable('project_persona_configs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  personaId: text('persona_id').notNull().references(() => writingPersonas.id, { onDelete: 'cascade' }),
  strength: integer('strength').notNull().default(65),
  enabledForOutline: integer('enabled_for_outline').notNull().default(1),
  enabledForDraft: integer('enabled_for_draft').notNull().default(1),
  enabledForPolish: integer('enabled_for_polish').notNull().default(0),
  enabledForQualityReview: integer('enabled_for_quality_review').notNull().default(0),
  projectOverrides: text('project_overrides'),
  disabledRules: text('disabled_rules'),
  ...timestamps,
})

export const personaMemoryFragments = pgTable('persona_memory_fragments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  fragmentType: text('fragment_type').$type<'style_pattern' | 'dialogue_pattern' | 'narrative_preference' | 'vocabulary_tendency' | 'pacing_preference'>().notNull(),
  content: text('content').notNull(),
  confidence: integer('confidence').notNull().default(70),
  sourceType: text('source_type').$type<'manual' | 'ai_extracted' | 'accumulated'>().notNull().default('ai_extracted'),
  sourceChapterIds: text('source_chapter_ids'),
  ...timestamps,
})
