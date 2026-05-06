import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { novelProjects } from './project'

export const characters = pgTable('characters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role'),
  goal: text('goal'),
  fear: text('fear'),
  secret: text('secret'),
  desire: text('desire'),
  weakness: text('weakness'),
  personality: text('personality'),
  arc: text('arc'),
  ...timestamps,
})

export const characterRelationships = pgTable('character_relationships', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  characterAId: text('character_a_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  characterBId: text('character_b_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  strength: integer('strength').notNull().default(1),
  status: text('status'),
  description: text('description'),
  ...timestamps,
})
