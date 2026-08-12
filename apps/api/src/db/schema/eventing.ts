import type { JsonObject } from '../../eventing/event-types'
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const aggregateStreams = pgTable('aggregate_streams', {
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  projectId: text('project_id'),
  currentVersion: integer('current_version').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.aggregateType, table.aggregateId] }),
  index('aggregate_streams_project_idx').on(table.projectId),
])

export const domainEvents = pgTable('domain_events', {
  globalPosition: bigserial('global_position', { mode: 'number' }).primaryKey(),
  eventId: text('event_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  aggregateVersion: integer('aggregate_version').notNull(),
  projectId: text('project_id'),
  eventType: text('event_type').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  payload: jsonb('payload').$type<JsonObject>().notNull(),
  metadata: jsonb('metadata').$type<JsonObject>().notNull(),
  commandId: text('command_id').notNull(),
  eventIndex: integer('event_index').notNull(),
  correlationId: text('correlation_id').notNull(),
  causationId: text('causation_id'),
  occurredAt: timestamp('occurred_at', { mode: 'string', withTimezone: true }).notNull(),
}, table => [
  uniqueIndex('domain_events_event_id_unique').on(table.eventId),
  uniqueIndex('domain_events_stream_version_unique')
    .on(table.aggregateType, table.aggregateId, table.aggregateVersion),
  uniqueIndex('domain_events_command_index_unique').on(table.commandId, table.eventIndex),
  index('domain_events_project_position_idx').on(table.projectId, table.globalPosition),
  index('domain_events_type_position_idx').on(table.eventType, table.globalPosition),
])

export const aggregateSnapshots = pgTable('aggregate_snapshots', {
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  projectId: text('project_id'),
  aggregateVersion: integer('aggregate_version').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  state: jsonb('state').$type<JsonObject>().notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
}, table => [
  primaryKey({ columns: [table.aggregateType, table.aggregateId] }),
])

export const commandReceipts = pgTable('command_receipts', {
  commandId: text('command_id').primaryKey(),
  commandType: text('command_type').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  projectId: text('project_id'),
  status: text('status').$type<'completed' | 'failed'>().notNull(),
  result: jsonb('result').$type<JsonObject>(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('command_receipts_aggregate_idx').on(table.aggregateType, table.aggregateId),
])

export const projectionCheckpoints = pgTable('projection_checkpoints', {
  projectionName: text('projection_name').primaryKey(),
  lastGlobalPosition: integer('last_global_position').notNull().default(0),
  status: text('status').$type<'idle' | 'running' | 'failed'>().notNull().default('idle'),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
})

export const eventOutbox = pgTable('event_outbox', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  handlerName: text('handler_name').notNull(),
  payload: jsonb('payload').$type<JsonObject>().notNull(),
  status: text('status').$type<'pending' | 'processing' | 'completed' | 'failed'>().notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  availableAt: timestamp('available_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: timestamp('lease_expires_at', { mode: 'string', withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { mode: 'string', withTimezone: true }),
}, table => [
  index('event_outbox_available_idx').on(table.status, table.availableAt),
  index('event_outbox_event_idx').on(table.eventId),
])
