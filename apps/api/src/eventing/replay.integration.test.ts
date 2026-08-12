import type { AppendBatch, PendingEvent, StreamRef } from './event-types'
import type { ProjectionDefinition } from './projection-runner'
import { Buffer } from 'node:buffer'
import { sql as drizzleSql, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { projectionCheckpoints } from '../db/schema'
import { ProjectDataKeyStore } from '../security/project-data-key.store'
import { resetTestDatabase } from '../test/database'
import { ProjectEventingContentProtector } from './content-protector'
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

function protectedReplayRuntime() {
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
  const protector = new ProjectEventingContentProtector(
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
    keys,
    store: protectedStore,
    projections: registryWith(replayDefinition(), events),
  }
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
