import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { novelProjects } from './project'

export const storyStructureTemplates = pgTable('story_structure_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  genre: text('genre'),
  structureType: text('structure_type').$type<'three_act' | 'five_act' | 'hero_journey' | 'custom'>().notNull(),
  actsJson: text('acts_json'), // 阶段定义
  beatsJson: text('beats_json'), // 节奏点/节拍定义
  conflictCurveJson: text('conflict_curve_json'), // 冲突曲线建议
  chapterCountEstimate: integer('chapter_count_estimate'),
  isBuiltin: integer('is_builtin').notNull().default(0),
  ...timestamps,
})

export const projectAppliedTemplates = pgTable('project_applied_templates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  templateId: text('template_id').notNull().references(() => storyStructureTemplates.id, { onDelete: 'cascade' }),
  appliedAt: timestamp('applied_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
  status: text('status').$type<'applied' | 'modified'>().notNull().default('applied'),
})
