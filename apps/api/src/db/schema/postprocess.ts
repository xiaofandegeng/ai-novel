import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { chapterPostprocessRuns, chapters } from './chapter'
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
  suggestionType: text('suggestion_type').$type<'fact_triple' | 'foreshadowing_add' | 'foreshadowing_payoff' | 'chapter_element' | 'character_state' | 'continuity_note' | 'style_note'>().notNull(),
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
