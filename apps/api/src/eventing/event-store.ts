import type { EventingContentProtector } from './content-protector'
import type {
  AggregateSnapshot,
  AppendBatch,
  CommandEnvelope,
  CommandReceiptRecord,
  JsonObject,
  OutboxIntent,
  StoredEvent,
  StreamRef,
} from './event-types'
import { and, asc, eq, gt, isNull, lte, max, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  aggregateSnapshots,
  aggregateStreams,
  domainEvents,
  eventOutbox,
  projectDataKeys,
} from '../db/schema'
import { NoopEventingContentProtector } from './content-protector'
import { DuplicateEventError, EventConcurrencyError } from './errors'
import {
  acquireEventStoreAppendLock,
  acquireEventStoreReplayLock,
} from './event-store-advisory-lock'

export type EventingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface ReplayEventBatch {
  events: StoredEvent[]
  lastGlobalPosition: number
  reachedEnd: boolean
}

export interface ReplayBoundary {
  horizon: number
  deletedProjectIds: ReadonlySet<string>
}

export interface EventStoreSession {
  transaction: EventingTransaction
  loadStream: (stream: StreamRef, fromVersion?: number) => Promise<StoredEvent[]>
  readAll: (afterPosition: number, limit: number) => Promise<StoredEvent[]>
  prepareReplay: () => Promise<ReplayBoundary>
  readAllForReplay: (
    afterPosition: number,
    limit: number,
    boundary: ReplayBoundary,
    projectId?: string,
  ) => Promise<ReplayEventBatch>
  appendBatch: (batch: AppendBatch) => Promise<StoredEvent[]>
  enqueueOutbox: (messages: OutboxIntent[]) => Promise<void>
  getSnapshot: (stream: StreamRef) => Promise<AggregateSnapshot | null>
  putSnapshot: (snapshot: AggregateSnapshot) => Promise<void>
  protectReceiptResult: (command: CommandEnvelope, result: JsonObject) => Promise<JsonObject>
  unprotectReceiptResult: (receipt: CommandReceiptRecord) => Promise<JsonObject>
  finalizeContentProtection: (events: StoredEvent[]) => Promise<void>
  isProjectDeleted: (projectId: string) => Promise<boolean>
}

export interface EventStoreOptions {
  contentProtector?: EventingContentProtector
  projectDeletedEventType?: string
}

export class EventStore {
  private readonly contentProtector: EventingContentProtector
  private readonly projectDeletedEventType: string | undefined

  constructor(options: EventStoreOptions = {}) {
    this.contentProtector = options.contentProtector ?? new NoopEventingContentProtector()
    this.projectDeletedEventType = options.projectDeletedEventType
  }

  async withTransaction<T>(work: (session: EventStoreSession) => Promise<T>): Promise<T> {
    return db.transaction(async (transaction) => {
      return work(createSession(
        transaction,
        this.contentProtector,
        this.projectDeletedEventType,
      ))
    })
  }

  async loadStream(stream: StreamRef, fromVersion = 0): Promise<StoredEvent[]> {
    const scope = stream.projectId
      ? eq(domainEvents.projectId, stream.projectId)
      : isNull(domainEvents.projectId)
    const rows = await db.select()
      .from(domainEvents)
      .where(and(
        eq(domainEvents.aggregateType, stream.aggregateType),
        eq(domainEvents.aggregateId, stream.aggregateId),
        scope,
        gt(domainEvents.aggregateVersion, fromVersion),
      ))
      .orderBy(asc(domainEvents.aggregateVersion))
    return this.contentProtector.unprotectEvents(db, rows.map(toStoredEvent))
  }

  async readAll(afterPosition: number, limit: number): Promise<StoredEvent[]> {
    const rows = await db.select()
      .from(domainEvents)
      .where(gt(domainEvents.globalPosition, afterPosition))
      .orderBy(asc(domainEvents.globalPosition))
      .limit(limit)
    return this.contentProtector.unprotectEvents(db, rows.map(toStoredEvent))
  }

  async readHeadersForDeletedProjects(): Promise<Set<string>> {
    if (!this.projectDeletedEventType) {
      if (this.contentProtector instanceof NoopEventingContentProtector)
        return new Set()
      throw new Error('Project deleted event type is not configured')
    }

    const rows = await db.select({ projectId: domainEvents.projectId })
      .from(domainEvents)
      .where(eq(domainEvents.eventType, this.projectDeletedEventType))
    return new Set(rows.flatMap(row => row.projectId ? [row.projectId] : []))
  }
}

function createSession(
  transaction: EventingTransaction,
  contentProtector: EventingContentProtector,
  projectDeletedEventType: string | undefined,
): EventStoreSession {
  return {
    transaction,
    async loadStream(stream, fromVersion = 0) {
      const scope = stream.projectId
        ? eq(domainEvents.projectId, stream.projectId)
        : isNull(domainEvents.projectId)
      const rows = await transaction.select()
        .from(domainEvents)
        .where(and(
          eq(domainEvents.aggregateType, stream.aggregateType),
          eq(domainEvents.aggregateId, stream.aggregateId),
          scope,
          gt(domainEvents.aggregateVersion, fromVersion),
        ))
        .orderBy(asc(domainEvents.aggregateVersion))
      return contentProtector.unprotectEvents(transaction, rows.map(toStoredEvent))
    },
    async readAll(afterPosition, limit) {
      const rows = await transaction.select()
        .from(domainEvents)
        .where(gt(domainEvents.globalPosition, afterPosition))
        .orderBy(asc(domainEvents.globalPosition))
        .limit(limit)
      return contentProtector.unprotectEvents(transaction, rows.map(toStoredEvent))
    },
    async prepareReplay() {
      await acquireEventStoreReplayLock(transaction)
      const [position] = await transaction.select({ horizon: max(domainEvents.globalPosition) })
        .from(domainEvents)
      const horizon = position?.horizon ?? 0

      await transaction.select({ projectId: projectDataKeys.projectId })
        .from(projectDataKeys)
        .where(sql`exists (
          select 1
          from ${domainEvents}
          where ${domainEvents.projectId} = ${projectDataKeys.projectId}
            and ${domainEvents.globalPosition} <= ${horizon}
        )`)
        .orderBy(asc(projectDataKeys.projectId))
        .for('share')

      if (!projectDeletedEventType) {
        if (contentProtector instanceof NoopEventingContentProtector)
          return { horizon, deletedProjectIds: new Set() }
        throw new Error('Project deleted event type is not configured')
      }

      const rows = await transaction.select({ projectId: domainEvents.projectId })
        .from(domainEvents)
        .where(eq(domainEvents.eventType, projectDeletedEventType))
      return {
        horizon,
        deletedProjectIds: new Set(rows.flatMap(row => row.projectId ? [row.projectId] : [])),
      }
    },
    async readAllForReplay(afterPosition, limit, boundary, projectId) {
      const rows = await transaction.select()
        .from(domainEvents)
        .where(and(
          gt(domainEvents.globalPosition, afterPosition),
          lte(domainEvents.globalPosition, boundary.horizon),
        ))
        .orderBy(asc(domainEvents.globalPosition))
        .limit(limit)
      const lastGlobalPosition = rows.at(-1)?.globalPosition ?? afterPosition
      const activeRows = rows.filter(row => (
        !row.projectId || !boundary.deletedProjectIds.has(row.projectId)
      ) && (!projectId || row.projectId === projectId))
      return {
        events: await contentProtector.unprotectEvents(
          transaction,
          activeRows.map(toStoredEvent),
        ),
        lastGlobalPosition,
        reachedEnd: rows.length < limit,
      }
    },
    async appendBatch(batch) {
      await acquireEventStoreAppendLock(transaction)
      const streams = normalizeStreams(batch)
      if (streams.length === 0)
        return []
      await contentProtector.prepareBatch(
        transaction,
        streams.flatMap(append => append.events.map(event => ({
          eventType: event.eventType,
          ...(append.stream.projectId ? { projectId: append.stream.projectId } : {}),
        }))),
      )
      const versions = new Map<string, number>()

      for (const append of [...streams].sort(compareStreams)) {
        const nextVersion = append.expectedVersion + append.events.length
        const streamKey = keyOf(append.stream)
        const updated = await transaction.update(aggregateStreams)
          .set({
            currentVersion: nextVersion,
            updatedAt: new Date().toISOString(),
          })
          .where(and(
            eq(aggregateStreams.aggregateType, append.stream.aggregateType),
            eq(aggregateStreams.aggregateId, append.stream.aggregateId),
            eq(aggregateStreams.currentVersion, append.expectedVersion),
          ))
          .returning({ currentVersion: aggregateStreams.currentVersion })

        if (updated.length > 0) {
          versions.set(streamKey, append.expectedVersion)
          continue
        }

        if (append.expectedVersion === 0) {
          const inserted = await transaction.insert(aggregateStreams)
            .values({
              aggregateType: append.stream.aggregateType,
              aggregateId: append.stream.aggregateId,
              projectId: append.stream.projectId ?? null,
              currentVersion: nextVersion,
            })
            .onConflictDoNothing()
            .returning({ currentVersion: aggregateStreams.currentVersion })
          if (inserted.length > 0) {
            versions.set(streamKey, 0)
            continue
          }
        }

        const [current] = await transaction.select({ currentVersion: aggregateStreams.currentVersion })
          .from(aggregateStreams)
          .where(and(
            eq(aggregateStreams.aggregateType, append.stream.aggregateType),
            eq(aggregateStreams.aggregateId, append.stream.aggregateId),
          ))
          .limit(1)
        throw new EventConcurrencyError(
          append.stream,
          append.expectedVersion,
          current?.currentVersion ?? 0,
        )
      }

      const events = streams.flatMap((append) => {
        const startingVersion = versions.get(keyOf(append.stream)) ?? append.expectedVersion
        return append.events.map((event, index): StoredEvent => ({
          globalPosition: 0,
          eventId: event.eventId,
          aggregateType: append.stream.aggregateType,
          aggregateId: append.stream.aggregateId,
          aggregateVersion: startingVersion + index + 1,
          ...(append.stream.projectId ? { projectId: append.stream.projectId } : {}),
          eventType: event.eventType,
          schemaVersion: event.schemaVersion,
          payload: event.payload,
          metadata: event.metadata,
          commandId: batch.commandId,
          eventIndex: 0,
          correlationId: batch.correlationId,
          ...(batch.causationId ? { causationId: batch.causationId } : {}),
          occurredAt: event.occurredAt,
        }))
      }).map((event, eventIndex) => ({ ...event, eventIndex }))
      const values: Array<typeof domainEvents.$inferInsert> = []
      for (const event of events) {
        const payload = await contentProtector.protectEvent(transaction, event)
        values.push(toEventInsert(event, payload))
      }

      try {
        const inserted = await transaction.insert(domainEvents).values(values).returning()
        return contentProtector.unprotectEvents(transaction, inserted.map(toStoredEvent))
      }
      catch (error: unknown) {
        if (isConstraintViolation(error, 'domain_events_event_id_unique')) {
          const duplicateId = values.find(value => value.eventId === constraintDetailValue(error))?.eventId
            ?? values[0]?.eventId
            ?? 'unknown'
          throw new DuplicateEventError(duplicateId)
        }
        throw error
      }
    },
    async enqueueOutbox(messages) {
      if (messages.length === 0)
        return
      await transaction.insert(eventOutbox)
        .values(messages.map(message => ({
          id: message.id,
          eventId: message.eventId,
          handlerName: message.handlerName,
          payload: message.payload,
          availableAt: message.availableAt ?? new Date().toISOString(),
        })))
        .onConflictDoNothing()
    },
    async getSnapshot(stream) {
      const scope = stream.projectId
        ? eq(aggregateSnapshots.projectId, stream.projectId)
        : isNull(aggregateSnapshots.projectId)
      const [snapshot] = await transaction.select()
        .from(aggregateSnapshots)
        .where(and(
          eq(aggregateSnapshots.aggregateType, stream.aggregateType),
          eq(aggregateSnapshots.aggregateId, stream.aggregateId),
          scope,
        ))
        .limit(1)
      if (!snapshot)
        return null
      const protectedSnapshot: AggregateSnapshot = {
        aggregateType: snapshot.aggregateType,
        aggregateId: snapshot.aggregateId,
        ...(snapshot.projectId ? { projectId: snapshot.projectId } : {}),
        aggregateVersion: snapshot.aggregateVersion,
        schemaVersion: snapshot.schemaVersion,
        state: snapshot.state,
        createdAt: normalizeTimestamp(snapshot.createdAt),
      }
      return {
        ...protectedSnapshot,
        state: await contentProtector.unprotectSnapshot(transaction, protectedSnapshot),
      }
    },
    async putSnapshot(snapshot) {
      const protectedState = await contentProtector.protectSnapshot(transaction, snapshot)
      await transaction.insert(aggregateSnapshots)
        .values({
          aggregateType: snapshot.aggregateType,
          aggregateId: snapshot.aggregateId,
          projectId: snapshot.projectId ?? null,
          aggregateVersion: snapshot.aggregateVersion,
          schemaVersion: snapshot.schemaVersion,
          state: protectedState,
          createdAt: snapshot.createdAt,
        })
        .onConflictDoUpdate({
          target: [aggregateSnapshots.aggregateType, aggregateSnapshots.aggregateId],
          set: {
            projectId: snapshot.projectId ?? null,
            aggregateVersion: snapshot.aggregateVersion,
            schemaVersion: snapshot.schemaVersion,
            state: protectedState,
            createdAt: snapshot.createdAt,
          },
        })
    },
    async protectReceiptResult(command, result) {
      return contentProtector.protectReceiptResult(transaction, command, result)
    },
    async unprotectReceiptResult(receipt) {
      return contentProtector.unprotectReceiptResult(transaction, receipt)
    },
    async finalizeContentProtection(events) {
      await contentProtector.finalizeBatch(transaction, events)
    },
    async isProjectDeleted(projectId) {
      if (!projectDeletedEventType)
        return false
      const [row] = await transaction.select({ eventId: domainEvents.eventId })
        .from(domainEvents)
        .where(and(
          eq(domainEvents.projectId, projectId),
          eq(domainEvents.eventType, projectDeletedEventType),
        ))
        .limit(1)
      return Boolean(row)
    },
  }
}

function toEventInsert(
  event: StoredEvent,
  payload: JsonObject,
): typeof domainEvents.$inferInsert {
  return {
    eventId: event.eventId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
    projectId: event.projectId ?? null,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    payload,
    metadata: event.metadata,
    commandId: event.commandId,
    eventIndex: event.eventIndex,
    correlationId: event.correlationId,
    causationId: event.causationId ?? null,
    occurredAt: event.occurredAt,
  }
}

function normalizeStreams(batch: AppendBatch): AppendBatch['streams'] {
  if (batch.streams.length === 0)
    return []

  const seen = new Set<string>()
  for (const append of batch.streams) {
    const key = keyOf(append.stream)
    if (seen.has(key))
      throw new Error(`Event batch contains duplicate stream: ${key}`)
    seen.add(key)
    if (!Number.isInteger(append.expectedVersion) || append.expectedVersion < 0)
      throw new Error(`Invalid expected version for ${key}: ${append.expectedVersion}`)
    if (append.events.length === 0)
      throw new Error(`Event batch contains an empty stream append: ${key}`)
  }
  return batch.streams
}

function compareStreams(left: AppendBatch['streams'][number], right: AppendBatch['streams'][number]): number {
  return keyOf(left.stream).localeCompare(keyOf(right.stream))
}

function keyOf(stream: StreamRef): string {
  return `${stream.aggregateType}/${stream.aggregateId}`
}

function toStoredEvent(row: typeof domainEvents.$inferSelect): StoredEvent {
  return {
    globalPosition: row.globalPosition,
    eventId: row.eventId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    aggregateVersion: row.aggregateVersion,
    ...(row.projectId ? { projectId: row.projectId } : {}),
    eventType: row.eventType,
    schemaVersion: row.schemaVersion,
    payload: row.payload,
    metadata: row.metadata,
    commandId: row.commandId,
    eventIndex: row.eventIndex,
    correlationId: row.correlationId,
    ...(row.causationId ? { causationId: row.causationId } : {}),
    occurredAt: normalizeTimestamp(row.occurredAt),
  }
}

function isConstraintViolation(error: unknown, constraintName: string): boolean {
  const databaseError = findDatabaseError(error)
  return databaseError?.code === '23505' && databaseError.constraint_name === constraintName
}

function constraintDetailValue(error: unknown): string | null {
  const detail = findDatabaseError(error)?.detail
  if (typeof detail !== 'string')
    return null
  return detail.match(/=\(([^)]+)\)/)?.[1] ?? null
}

function findDatabaseError(error: unknown): Record<string, unknown> | null {
  let current = error
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== 'object' || current === null)
      return null
    const record = current as Record<string, unknown>
    if (typeof record.code === 'string')
      return record
    current = record.cause
  }
  return null
}

function normalizeTimestamp(value: string): string {
  return new Date(value).toISOString()
}
