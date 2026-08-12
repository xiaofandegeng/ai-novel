import type { AppendBatch, PendingEvent, StreamRef } from './event-types'
import type { ProjectionDefinition } from './projection-runner'
import { Buffer } from 'node:buffer'
import { asc, sql as drizzleSql, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { projectionCheckpoints } from '../db/schema'
import { ProjectDataKeyStore } from '../security/project-data-key.store'
import { resetTestDatabase } from '../test/database'
import {
  NoopEventingContentProtector,
  ProjectEventingContentProtector,
} from './content-protector'
import { EventRegistry } from './event-registry'
import { EventStore } from './event-store'
import { ProjectionRegistry, ProjectionRunner } from './projection-runner'
import { ProjectionReplay } from './replay'

const PROJECT_DELETED = 'FixtureProjectDeleted'

const streamA: StreamRef = {
  aggregateType: 'KernelReplayTest',
  aggregateId: 'aggregate-a',
  projectId: 'project-a',
}
const streamB: StreamRef = {
  aggregateType: 'KernelReplayTest',
  aggregateId: 'aggregate-b',
  projectId: 'project-b',
}

afterAll(async () => {
  await sql`drop table if exists eventing_replay_test_projection`
  await sql.end()
})

describe('projectionReplay', () => {
  const store = new EventStore()

  beforeEach(async () => {
    await resetTestDatabase()
    await sql`
      create table if not exists eventing_replay_test_projection (
        project_id text primary key,
        event_ids jsonb not null
      )
    `
  })

  it('resets and rebuilds one projection deterministically', async () => {
    await appendEvents()
    const registry = registryWith(replayDefinition())
    await new ProjectionRunner(registry, store).runBatch('kernel-replay', 10)
    const before = await readProjection()

    const result = await new ProjectionReplay(registry, store)
      .replayProjection('kernel-replay')

    expect(result).toEqual({
      projectionName: 'kernel-replay',
      processedEvents: 3,
      lastGlobalPosition: 3,
    })
    expect(await readProjection()).toEqual(before)
  })

  it('replays one project while preserving every other project row', async () => {
    await appendEvents()
    const registry = registryWith(replayDefinition())
    const replay = new ProjectionReplay(registry, store)
    await replay.replayProjection('kernel-replay')
    const projectBBefore = await readProject('project-b')
    await sql`
      update eventing_replay_test_projection
      set event_ids = '["stale"]'::jsonb
      where project_id = 'project-a'
    `

    await replay.replayProjection('kernel-replay', { projectId: 'project-a' })

    expect(await readProject('project-a')).toEqual(['event-a-1', 'event-a-2'])
    expect(await readProject('project-b')).toEqual(projectBBefore)
  })

  it('replays an empty event store and resets a stale checkpoint', async () => {
    const registry = registryWith(replayDefinition())
    await db.insert(projectionCheckpoints).values({
      projectionName: 'kernel-replay',
      lastGlobalPosition: 99,
      status: 'failed',
      lastError: 'stale failure',
    })

    await expect(new ProjectionReplay(registry, store).replayProjection('kernel-replay'))
      .resolves
      .toEqual({
        projectionName: 'kernel-replay',
        processedEvents: 0,
        lastGlobalPosition: 0,
      })
    await expect(readCheckpoint()).resolves.toMatchObject({
      lastGlobalPosition: 0,
      status: 'idle',
      lastError: null,
    })
  })

  it('processes the global event feed in bounded batches', async () => {
    await appendEvents()
    const registry = registryWith(replayDefinition())

    await expect(new ProjectionReplay(registry, store).replayProjection(
      'kernel-replay',
      { batchSize: 1 },
    )).resolves.toMatchObject({
      processedEvents: 3,
      lastGlobalPosition: 3,
    })
    expect(await readProjection()).toEqual([
      { projectId: 'project-a', eventIds: ['event-a-1', 'event-a-2'] },
      { projectId: 'project-b', eventIds: ['event-b-1'] },
    ])
  })

  it('discovers tombstones before reset and skips every deleted-project event during all replay', async () => {
    const runtime = protectedReplayRuntime()
    await appendProtectedReplayProjects(runtime.store)
    await sql`
      insert into eventing_replay_test_projection (project_id, event_ids)
      values
        ('active-project', '["stale-active"]'::jsonb),
        ('deleted-project', '["stale-deleted"]'::jsonb)
    `

    await expect(new ProjectionReplay(runtime.projections, runtime.store).replayAll({ batchSize: 1 }))
      .resolves
      .toEqual([
        {
          projectionName: 'kernel-replay',
          processedEvents: 1,
          lastGlobalPosition: 3,
        },
      ])
    expect(await readProjection()).toEqual([
      { projectId: 'active-project', eventIds: ['active-event'] },
    ])
  })

  it('resets a deleted project in isolated replay without decrypting its history', async () => {
    const runtime = protectedReplayRuntime()
    await appendProtectedReplayProjects(runtime.store)
    await runtime.store.withTransaction(session => runtime.keys.destroy(
      session.transaction,
      'active-project',
      '2026-08-12T00:02:00.000Z',
    ))
    await sql`
      insert into eventing_replay_test_projection (project_id, event_ids)
      values
        ('active-project', '["preserved-active"]'::jsonb),
        ('deleted-project', '["stale-deleted"]'::jsonb)
    `

    await expect(new ProjectionReplay(runtime.projections, runtime.store).replayProjection(
      'kernel-replay',
      { projectId: 'deleted-project', batchSize: 1 },
    )).resolves.toEqual({
      projectionName: 'kernel-replay',
      processedEvents: 0,
      lastGlobalPosition: 3,
    })
    expect(await readProjection()).toEqual([
      { projectId: 'active-project', eventIds: ['preserved-active'] },
    ])
  })

  it('waits for an in-flight deletion before discovering tombstones and resetting projections', async () => {
    const runtime = protectedReplayRuntime()
    await appendProtectedReplayProject(runtime.store, 'racing-project', 'racing-event')
    await sql`
      insert into eventing_replay_test_projection (project_id, event_ids)
      values ('racing-project', '["stale"]'::jsonb)
    `
    const deletionReady = deferred()
    const releaseDeletion = deferred()
    const deletion = deleteProtectedReplayProject(
      runtime.store,
      'racing-project',
      'racing-event',
      async () => {
        deletionReady.resolve()
        await releaseDeletion.promise
      },
    )
    await deletionReady.promise

    const replay = new ProjectionReplay(runtime.projections, runtime.store)
      .replayAll({ batchSize: 1 })
    const replayWaitedForAppend = await waitForBlockedDatabaseQuery('pg_advisory_xact_lock(')
    releaseDeletion.resolve()
    const [deletionOutcome, replayOutcome] = await Promise.allSettled([deletion, replay])

    expect(replayWaitedForAppend).toBe(true)
    expect(deletionOutcome.status).toBe('fulfilled')
    expect(replayOutcome).toEqual({
      status: 'fulfilled',
      value: [{
        projectionName: 'kernel-replay',
        processedEvents: 0,
        lastGlobalPosition: 2,
      }],
    })
    expect(await readProject('racing-project')).toBeUndefined()
  })

  it('holds key locks until replay commits so a later deletion cannot resurrect its projection', async () => {
    const runtime = protectedReplayRuntime()
    await appendProtectedReplayProject(runtime.store, 'racing-project', 'racing-event')
    const replayReachedReset = deferred()
    const releaseReplay = deferred()
    const definition = replayDefinition()
    const reset = definition.reset!
    definition.reset = async (transaction, projectId) => {
      replayReachedReset.resolve()
      await releaseReplay.promise
      await reset(transaction, projectId)
    }
    const projections = registryWith(definition, runtime.events)

    const replay = new ProjectionReplay(projections, runtime.store)
      .replayAll({ batchSize: 1 })
    await replayReachedReset.promise
    const deletion = deleteProtectedReplayProject(
      runtime.store,
      'racing-project',
      'racing-event',
    )
    const deletionWaitedForReplay = await Promise.race([
      waitForBlockedDatabaseQuery('pg_advisory_xact_lock_shared'),
      deletion.then(() => false),
    ])
    releaseReplay.resolve()
    const [replayOutcome, deletionOutcome] = await Promise.allSettled([replay, deletion])

    expect(deletionWaitedForReplay).toBe(true)
    expect(replayOutcome.status).toBe('fulfilled')
    expect(deletionOutcome.status).toBe('fulfilled')
    expect(await readProject('racing-project')).toBeUndefined()
  })

  it('reuses one replay horizon for every registered projection and excludes later events', async () => {
    const runtime = protectedReplayRuntime()
    await appendProtectedReplayProject(runtime.store, 'horizon-project', 'before-horizon')
    const firstProjectionEntered = deferred()
    const releaseFirstProjection = deferred()
    const firstSeen: string[] = []
    const secondSeen: string[] = []
    const projections = new ProjectionRegistry(runtime.events)
    projections.register(memoryProjection(
      'horizon-first',
      firstSeen,
      async () => {
        firstProjectionEntered.resolve()
        await releaseFirstProjection.promise
      },
    ))
    projections.register(memoryProjection('horizon-second', secondSeen))

    const replay = new ProjectionReplay(projections, runtime.store)
      .replayAll({ batchSize: 1 })
    await firstProjectionEntered.promise
    const laterAppend = appendProtectedReplayEvent(
      runtime.store,
      'horizon-project',
      'after-horizon',
      1,
    )
    const laterAppendWaitedForReplay = await waitForBlockedDatabaseQuery(
      'pg_advisory_xact_lock_shared',
    )
    releaseFirstProjection.resolve()

    await expect(replay).resolves.toEqual([
      { projectionName: 'horizon-first', processedEvents: 1, lastGlobalPosition: 1 },
      { projectionName: 'horizon-second', processedEvents: 1, lastGlobalPosition: 1 },
    ])
    await expect(laterAppend).resolves.toBeUndefined()
    expect(laterAppendWaitedForReplay).toBe(true)
    expect(firstSeen).toEqual(['before-horizon'])
    expect(secondSeen).toEqual(['before-horizon'])
  })

  it('waits for an uncommitted lower position before capturing one horizon for every projection', async () => {
    const appendInserted = deferred()
    const releaseAppend = deferred()
    const pausingStore = new EventStore({
      contentProtector: new PausingAfterInsertContentProtector(
        appendInserted,
        releaseAppend,
      ),
    })
    const lowerAppend = appendReplayEvent(
      pausingStore,
      'gap-lower-project',
      'gap-lower-event',
    )
    await appendInserted.promise
    await appendReplayEvent(
      new EventStore(),
      'gap-higher-project',
      'gap-higher-event',
    )

    const firstSeen: string[] = []
    const secondSeen: string[] = []
    const projections = new ProjectionRegistry()
    projections.register(memoryProjection('gap-first', firstSeen))
    projections.register(memoryProjection('gap-second', secondSeen))
    const replay = new ProjectionReplay(projections, new EventStore()).replayAll({ batchSize: 1 })

    const replayWaitedForAppend = await waitForBlockedDatabaseQuery('pg_advisory_xact_lock(')
    releaseAppend.resolve()
    const [appendOutcome, replayOutcome] = await Promise.allSettled([lowerAppend, replay])

    expect(replayWaitedForAppend).toBe(true)
    expect(appendOutcome.status).toBe('fulfilled')
    expect(replayOutcome).toEqual({
      status: 'fulfilled',
      value: [
        { projectionName: 'gap-first', processedEvents: 2, lastGlobalPosition: 2 },
        { projectionName: 'gap-second', processedEvents: 2, lastGlobalPosition: 2 },
      ],
    })
    expect(firstSeen).toEqual(['gap-lower-event', 'gap-higher-event'])
    expect(secondSeen).toEqual(firstSeen)
    await expect(readCheckpoints(['gap-first', 'gap-second'])).resolves.toEqual([
      { projectionName: 'gap-first', lastGlobalPosition: 2, status: 'idle' },
      { projectionName: 'gap-second', lastGlobalPosition: 2, status: 'idle' },
    ])
  }, 10_000)

  it('takes the global append lock before a deletion key lock so replay cannot deadlock', async () => {
    const prepareEntered = deferred()
    const releasePrepare = deferred()
    const runtime = protectedReplayRuntime({ prepareEntered, releasePrepare })
    await appendProtectedReplayProject(runtime.store, 'ordered-project', 'ordered-event')

    runtime.protector.pauseNextPrepare()
    const deletion = deleteProtectedReplayProject(
      runtime.store,
      'ordered-project',
      'ordered-event',
    )
    await prepareEntered.promise
    const replay = new ProjectionReplay(runtime.projections, runtime.store)
      .replayAll({ batchSize: 1 })
    const replayWaitedForAppend = await waitForBlockedDatabaseQuery('pg_advisory_xact_lock(')

    releasePrepare.resolve()
    const [deletionOutcome, replayOutcome] = await Promise.allSettled([deletion, replay])

    expect(replayWaitedForAppend).toBe(true)
    expect(deletionOutcome.status).toBe('fulfilled')
    expect(replayOutcome.status).toBe('fulfilled')
    expect(await readProject('ordered-project')).toBeUndefined()
  }, 10_000)

  it('upcasts stored events before sending them to a replay projector', async () => {
    const events = new EventRegistry()
    events.register({
      eventType: 'KernelReplayRecorded',
      currentSchemaVersion: 2,
      payloadProtection: 'none',
      upcasters: {
        1: payload => ({
          ...(payload as Record<string, unknown>),
          label: 'upcasted',
        }),
      },
      validate: (payload) => {
        const value = payload as { eventId?: unknown, label?: unknown }
        if (typeof value.eventId !== 'string' || typeof value.label !== 'string')
          throw new Error('invalid replay event')
        return { eventId: value.eventId, label: value.label }
      },
    })
    await appendEvents()
    const seen: Array<{ label: unknown, schemaVersion: number }> = []
    const definition = replayDefinition()
    definition.project = async (_transaction, event) => {
      seen.push({ label: event.payload.label, schemaVersion: event.schemaVersion })
    }
    const registry = registryWith(definition, events)

    await new ProjectionReplay(registry, store).replayProjection('kernel-replay')

    expect(seen).toEqual([
      { label: 'upcasted', schemaVersion: 2 },
      { label: 'upcasted', schemaVersion: 2 },
      { label: 'upcasted', schemaVersion: 2 },
    ])
  })

  it('leaves a diagnostic checkpoint when replay fails', async () => {
    await appendEvents()
    await sql`
      insert into eventing_replay_test_projection (project_id, event_ids)
      values ('project-a', '["preserved"]'::jsonb)
    `
    const definition = replayDefinition()
    definition.project = async () => {
      throw new Error('replay projection failed')
    }
    const registry = registryWith(definition)

    await expect(new ProjectionReplay(registry, store).replayProjection('kernel-replay'))
      .rejects
      .toThrow('replay projection failed')

    expect(await readProject('project-a')).toEqual(['preserved'])
    await expect(readCheckpoint()).resolves.toMatchObject({
      lastGlobalPosition: 0,
      status: 'failed',
      lastError: 'replay projection failed',
    })
  })

  it('replays all registered projections in registration order', async () => {
    await appendEvents()
    const registry = new ProjectionRegistry()
    registry.register(replayDefinition('kernel-replay-first'))
    registry.register(replayDefinition('kernel-replay-second'))

    await expect(new ProjectionReplay(registry, store).replayAll({ batchSize: 2 }))
      .resolves
      .toEqual([
        { projectionName: 'kernel-replay-first', processedEvents: 3, lastGlobalPosition: 3 },
        { projectionName: 'kernel-replay-second', processedEvents: 3, lastGlobalPosition: 3 },
      ])
  })

  it('rejects invalid batch sizes and projections without reset support', async () => {
    const registry = registryWith(replayDefinition())
    const replay = new ProjectionReplay(registry, store)
    await expect(replay.replayProjection('kernel-replay', { batchSize: 0 }))
      .rejects
      .toThrow('positive integer')
    await expect(replay.replayProjection('kernel-replay', { batchSize: 0.5 }))
      .rejects
      .toThrow('positive integer')

    const withoutReset = replayDefinition('kernel-no-reset')
    delete withoutReset.reset
    registry.register(withoutReset)
    await expect(replay.replayProjection('kernel-no-reset'))
      .rejects
      .toThrow('does not support replay reset')
  })
})

function replayDefinition(name = 'kernel-replay'): ProjectionDefinition {
  return {
    name,
    mode: 'async',
    handles: ['KernelReplayRecorded'],
    project: async (transaction, event) => {
      await transaction.execute(drizzleSql`
        insert into eventing_replay_test_projection (project_id, event_ids)
        values (${event.projectId}, ${JSON.stringify([event.eventId])}::jsonb)
        on conflict (project_id) do update
        set event_ids = eventing_replay_test_projection.event_ids || excluded.event_ids
      `)
    },
    reset: async (transaction, projectId) => {
      if (projectId) {
        await transaction.execute(drizzleSql`
          delete from eventing_replay_test_projection where project_id = ${projectId}
        `)
        return
      }
      await transaction.execute(drizzleSql`delete from eventing_replay_test_projection`)
    },
  }
}

function registryWith(
  definition: ProjectionDefinition,
  events?: EventRegistry,
): ProjectionRegistry {
  const registry = new ProjectionRegistry(events)
  registry.register(definition)
  return registry
}

async function appendEvents(): Promise<void> {
  const batch: AppendBatch = {
    commandId: 'command-replay',
    correlationId: 'correlation-replay',
    streams: [
      {
        stream: streamA,
        expectedVersion: 0,
        events: [
          pending('event-a-1'),
          pending('event-a-2'),
        ],
      },
      {
        stream: streamB,
        expectedVersion: 0,
        events: [pending('event-b-1')],
      },
    ],
  }
  await new EventStore().withTransaction(session => session.appendBatch(batch))
}

interface ProtectedReplayRuntime<TProtector extends ProjectEventingContentProtector> {
  events: EventRegistry
  keys: ProjectDataKeyStore
  protector: TProtector
  store: EventStore
  projections: ProjectionRegistry
}

function protectedReplayRuntime(): ProtectedReplayRuntime<ProjectEventingContentProtector>
function protectedReplayRuntime(pause: {
  prepareEntered: Deferred
  releasePrepare: Deferred
}): ProtectedReplayRuntime<PausingPrepareContentProtector>
function protectedReplayRuntime(pause?: {
  prepareEntered: Deferred
  releasePrepare: Deferred
}): ProtectedReplayRuntime<ProjectEventingContentProtector> {
  const events = new EventRegistry()
  events.register({
    eventType: 'KernelReplayRecorded',
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: payload => payload as Record<string, unknown>,
  })
  events.register({
    eventType: PROJECT_DELETED,
    currentSchemaVersion: 1,
    payloadProtection: 'none',
    upcasters: {},
    validate: payload => payload as Record<string, unknown>,
  })
  const keys = new ProjectDataKeyStore(Buffer.alloc(32, 37))
  const protector = pause
    ? new PausingPrepareContentProtector(
        events,
        keys,
        {
          projectCreatedEventType: 'KernelReplayRecorded',
          projectDeletedEventType: PROJECT_DELETED,
        },
        pause.prepareEntered,
        pause.releasePrepare,
      )
    : new ProjectEventingContentProtector(
        events,
        keys,
        {
          projectCreatedEventType: 'KernelReplayRecorded',
          projectDeletedEventType: PROJECT_DELETED,
        },
      )
  const protectedStore = new EventStore({
    contentProtector: protector,
    projectDeletedEventType: PROJECT_DELETED,
  })
  return {
    events,
    keys,
    protector,
    store: protectedStore,
    projections: registryWith(replayDefinition(), events),
  }
}

class PausingAfterInsertContentProtector extends NoopEventingContentProtector {
  private paused = false

  constructor(
    private readonly appendInserted: Deferred,
    private readonly releaseAppend: Deferred,
  ) {
    super()
  }

  override async unprotectEvents(
    executor: Parameters<NoopEventingContentProtector['unprotectEvents']>[0],
    events: Parameters<NoopEventingContentProtector['unprotectEvents']>[1],
  ) {
    if (!this.paused && events.some(event => event.globalPosition > 0)) {
      this.paused = true
      this.appendInserted.resolve()
      await this.releaseAppend.promise
    }
    return super.unprotectEvents(executor, events)
  }
}

class PausingPrepareContentProtector extends ProjectEventingContentProtector {
  private shouldPause = false

  constructor(
    events: ConstructorParameters<typeof ProjectEventingContentProtector>[0],
    keys: ConstructorParameters<typeof ProjectEventingContentProtector>[1],
    lifecycleEvents: ConstructorParameters<typeof ProjectEventingContentProtector>[2],
    private readonly prepareEntered: Deferred,
    private readonly releasePrepare: Deferred,
  ) {
    super(events, keys, lifecycleEvents)
  }

  pauseNextPrepare(): void {
    this.shouldPause = true
  }

  override async prepareBatch(
    ...args: Parameters<ProjectEventingContentProtector['prepareBatch']>
  ): Promise<void> {
    if (this.shouldPause) {
      this.shouldPause = false
      this.prepareEntered.resolve()
      await this.releasePrepare.promise
    }
    await super.prepareBatch(...args)
  }
}

async function appendReplayEvent(
  store: EventStore,
  projectId: string,
  eventId: string,
): Promise<void> {
  await store.withTransaction(async (session) => {
    await session.appendBatch({
      commandId: `command-${eventId}`,
      correlationId: `correlation-${eventId}`,
      streams: [{
        stream: {
          aggregateType: 'KernelReplayTest',
          aggregateId: projectId,
          projectId,
        },
        expectedVersion: 0,
        events: [pending(eventId)],
      }],
    })
  })
}

async function appendProtectedReplayProject(
  store: EventStore,
  projectId: string,
  eventId: string,
): Promise<void> {
  await store.withTransaction(session => session.appendBatch({
    commandId: `command-${eventId}`,
    correlationId: `correlation-${eventId}`,
    streams: [{
      stream: {
        aggregateType: 'KernelReplayTest',
        aggregateId: projectId,
        projectId,
      },
      expectedVersion: 0,
      events: [pending(eventId)],
    }],
  }))
}

async function appendProtectedReplayEvent(
  store: EventStore,
  projectId: string,
  eventId: string,
  expectedVersion: number,
): Promise<void> {
  await store.withTransaction(session => session.appendBatch({
    commandId: `command-${eventId}`,
    correlationId: `correlation-${eventId}`,
    streams: [{
      stream: {
        aggregateType: 'KernelReplayTest',
        aggregateId: projectId,
        projectId,
      },
      expectedVersion,
      events: [pending(eventId)],
    }],
  }))
}

async function deleteProtectedReplayProject(
  store: EventStore,
  projectId: string,
  precedingEventId: string,
  beforeCommit: () => Promise<void> = async () => {},
): Promise<void> {
  await store.withTransaction(async (session) => {
    const deletedEvents = await session.appendBatch({
      commandId: `command-delete-${projectId}`,
      correlationId: `correlation-delete-${projectId}`,
      streams: [{
        stream: {
          aggregateType: 'KernelReplayTest',
          aggregateId: projectId,
          projectId,
        },
        expectedVersion: 1,
        events: [{
          ...pending(`deleted-${precedingEventId}`),
          eventType: PROJECT_DELETED,
          payload: { deletedAt: '2026-08-12T00:03:00.000Z' },
        }],
      }],
    })
    await session.transaction.execute(drizzleSql`
      delete from eventing_replay_test_projection where project_id = ${projectId}
    `)
    await session.finalizeContentProtection(deletedEvents)
    await beforeCommit()
  })
}

function memoryProjection(
  name: string,
  seen: string[],
  beforeFirstEvent: () => Promise<void> = async () => {},
): ProjectionDefinition {
  let first = true
  return {
    name,
    mode: 'async',
    handles: ['KernelReplayRecorded'],
    reset: async () => {},
    project: async (_transaction, event) => {
      if (first) {
        first = false
        await beforeFirstEvent()
      }
      seen.push(String(event.payload.eventId))
    },
  }
}

async function waitForBlockedDatabaseQuery(fragment: string): Promise<boolean> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await sql<{ blocked: boolean }[]>`
      select exists (
        select 1
        from pg_stat_activity
        where pid <> pg_backend_pid()
          and datname = current_database()
          and wait_event_type = 'Lock'
          and cardinality(pg_blocking_pids(pid)) > 0
          and query ilike ${`%${fragment}%`}
      ) as blocked
    `
    if (row?.blocked)
      return true
  }
  return false
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function appendProtectedReplayProjects(store: EventStore): Promise<void> {
  await store.withTransaction(async (session) => {
    await session.appendBatch({
      commandId: 'command-protected-projects',
      correlationId: 'correlation-protected-projects',
      streams: [
        {
          stream: {
            aggregateType: 'KernelReplayTest',
            aggregateId: 'active-project',
            projectId: 'active-project',
          },
          expectedVersion: 0,
          events: [pending('active-event')],
        },
        {
          stream: {
            aggregateType: 'KernelReplayTest',
            aggregateId: 'deleted-project',
            projectId: 'deleted-project',
          },
          expectedVersion: 0,
          events: [pending('deleted-event')],
        },
      ],
    })
    const deletedEvents = await session.appendBatch({
      commandId: 'command-delete-project',
      correlationId: 'correlation-delete-project',
      streams: [{
        stream: {
          aggregateType: 'KernelReplayTest',
          aggregateId: 'deleted-project',
          projectId: 'deleted-project',
        },
        expectedVersion: 1,
        events: [{
          ...pending('deleted-tombstone'),
          eventType: PROJECT_DELETED,
          payload: { deletedAt: '2026-08-12T00:01:00.000Z' },
        }],
      }],
    })
    await session.finalizeContentProtection(deletedEvents)
  })
}

function pending(eventId: string): PendingEvent {
  return {
    eventId,
    eventType: 'KernelReplayRecorded',
    schemaVersion: 1,
    payload: { eventId },
    metadata: { actorType: 'system' },
    occurredAt: '2026-08-11T00:00:00.000Z',
  }
}

async function readProjection() {
  const rows = await sql<{ project_id: string, event_ids: string[] }[]>`
    select project_id, event_ids
    from eventing_replay_test_projection
    order by project_id
  `
  return rows.map(row => ({ projectId: row.project_id, eventIds: row.event_ids }))
}

async function readProject(projectId: string): Promise<string[] | undefined> {
  const [row] = await sql<{ event_ids: string[] }[]>`
    select event_ids
    from eventing_replay_test_projection
    where project_id = ${projectId}
  `
  return row?.event_ids
}

async function readCheckpoint() {
  const [checkpoint] = await db.select()
    .from(projectionCheckpoints)
    .where(eq(projectionCheckpoints.projectionName, 'kernel-replay'))
    .limit(1)
  return checkpoint
}

async function readCheckpoints(projectionNames: string[]) {
  return db.select({
    projectionName: projectionCheckpoints.projectionName,
    lastGlobalPosition: projectionCheckpoints.lastGlobalPosition,
    status: projectionCheckpoints.status,
  })
    .from(projectionCheckpoints)
    .where(inArray(projectionCheckpoints.projectionName, projectionNames))
    .orderBy(asc(projectionCheckpoints.projectionName))
}
