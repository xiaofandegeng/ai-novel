import { pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { chapters, chapterScenes } from './chapter'
import { characters } from './character'
import { novelProjects } from './project'

export const characterArcEvents = pgTable('character_arc_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull().$type<
    'goal_shift' | 'fear_triggered' | 'secret_revealed' | 'relationship_changed' | 'belief_changed' | 'ability_changed' | 'trauma' | 'victory' | 'loss'
  >(),
  beforeState: text('before_state'),
  afterState: text('after_state'),
  motivationChange: text('motivation_change'),
  relationshipImpact: text('relationship_impact'),
  evidence: text('evidence'),
  sourceType: text('source_type').notNull().$type<'ai_extracted' | 'manual'>().default('manual'),
  ...timestamps,
})
