import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { novelProjects } from './project'

export const volumes = pgTable('volumes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  orderIndex: integer('order_index').notNull(),
  ...timestamps,
})

export const acts = pgTable('acts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  volumeId: text('volume_id').references(() => volumes.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  theme: text('theme'),
  keyEvents: text('key_events'),
  targetChapterCount: integer('target_chapter_count'),
  orderIndex: integer('order_index').notNull(),
  ...timestamps,
})

export const conflicts = pgTable('conflicts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').$type<'internal' | 'external'>().notNull(),
  intensity: integer('intensity').notNull().default(1),
  status: text('status').$type<'latent' | 'forming' | 'escalating' | 'exploding' | 'resolved' | 'abandoned'>().notNull().default('latent'),
  participants: text('participants'),
  description: text('description'),
  resolution: text('resolution'),
  ...timestamps,
})
