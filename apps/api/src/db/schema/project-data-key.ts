import type { EncryptedJsonEnvelope } from '../../security/project-content-crypto'
import { sql } from 'drizzle-orm'
import { check, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export type ProjectDataKeyAlgorithm = 'aes-256-gcm'

export const projectDataKeys = pgTable('project_data_keys', {
  projectId: text('project_id').primaryKey(),
  wrappedKey: jsonb('wrapped_key').$type<EncryptedJsonEnvelope>(),
  keyVersion: integer('key_version').notNull(),
  algorithm: text('algorithm').$type<ProjectDataKeyAlgorithm>().notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  destroyedAt: timestamp('destroyed_at', { mode: 'string', withTimezone: true }),
}, table => [
  check(
    'project_data_keys_active_or_destroyed_check',
    sql`(${table.wrappedKey} is not null and ${table.destroyedAt} is null)
      or (${table.wrappedKey} is null and ${table.destroyedAt} is not null)`,
  ),
])
