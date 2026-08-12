import type { AggregateSnapshot, AppendBatch, PendingEvent, StreamRef } from './event-types'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../db'
import { resetTestDatabase } from '../test/database'
import { DuplicateEventError, EventConcurrencyError } from './errors'
import { EventStore } from './event-store'

const firstStream: StreamRef = {
  aggregateType: 'KernelTest',
  aggregateId: 'kernel-1',
  projectId: 'project-1',
}
const secondStream: StreamRef = {
  aggregateType: 'KernelTest',
  aggregateId: 'kernel-2',
  projectId: 'project-1',
}

describe('eventStore', () => {
  const store = new EventStore()

  beforeEach(resetTestDatabase)
  afterAll(() => sql.end())

  it('appends and loads one stream in aggregate version order', async () => {
    const stored = await store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: firstStream,
        expectedVersion: 0,
        events: [pending('event-1', 'KernelTestCreated'), pending('event-2', 'KernelTestRenamed')],
      },
    ])))

    expect(stored.map(event => event.aggregateVersion)).toEqual([1, 2])
    await expect(store.loadStream(firstStream)).resolves.toMatchObject([
      { eventId: 'event-1', eventType: 'KernelTestCreated', aggregateVersion: 1 },
      { eventId: 'event-2', eventType: 'KernelTestRenamed', aggregateVersion: 2 },
    ])
  })

  it('does not load events or snapshots through another project scope', async () => {
    await appendInitialEvent(store)
    await store.withTransaction(session => session.putSnapshot({
      ...firstStream,
      aggregateVersion: 1,
      schemaVersion: 1,
      state: { title: '项目一' },
      createdAt: '2026-08-11T00:00:00.000Z',
    }))
    const foreignScope = { ...firstStream, projectId: 'project-2' }

    await expect(store.loadStream(foreignScope)).resolves.toEqual([])
    await expect(store.withTransaction(session => session.loadStream(foreignScope)))
      .resolves
      .toEqual([])
    await expect(store.withTransaction(session => session.getSnapshot(foreignScope)))
      .resolves
      .toBeNull()
  })

  it('rejects a stale expected version without appending an event', async () => {
    await appendInitialEvent(store)

    await expect(store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: firstStream,
        expectedVersion: 0,
        events: [pending('event-stale', 'KernelTestChanged')],
      },
    ])))).rejects.toBeInstanceOf(EventConcurrencyError)
    await expect(store.loadStream(firstStream)).resolves.toHaveLength(1)
  })

  it('atomically appends events to multiple streams', async () => {
    const stored = await store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: firstStream,
        expectedVersion: 0,
        events: [pending('event-a1', 'KernelTestCreated')],
      },
      {
        stream: secondStream,
        expectedVersion: 0,
        events: [pending('event-b1', 'KernelTestCreated'), pending('event-b2', 'KernelTestChanged')],
      },
    ])))

    expect(stored).toHaveLength(3)
    await expect(store.loadStream(firstStream)).resolves.toHaveLength(1)
    await expect(store.loadStream(secondStream)).resolves.toHaveLength(2)
  })

  it('rolls back every stream when one expected version is stale', async () => {
    await appendInitialEvent(store)

    await expect(store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: secondStream,
        expectedVersion: 0,
        events: [pending('event-new-stream', 'KernelTestCreated')],
      },
      {
        stream: firstStream,
        expectedVersion: 0,
        events: [pending('event-conflict', 'KernelTestChanged')],
      },
    ])))).rejects.toBeInstanceOf(EventConcurrencyError)

    await expect(store.loadStream(firstStream)).resolves.toHaveLength(1)
    await expect(store.loadStream(secondStream)).resolves.toHaveLength(0)
  })

  it('maps a reused event id to a duplicate event error', async () => {
    await appendInitialEvent(store)

    await expect(store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: secondStream,
        expectedVersion: 0,
        events: [pending('event-initial', 'KernelTestCreated')],
      },
    ])))).rejects.toBeInstanceOf(DuplicateEventError)
    await expect(store.loadStream(secondStream)).resolves.toHaveLength(0)
  })

  it('assigns monotonically increasing global positions', async () => {
    await store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: firstStream,
        expectedVersion: 0,
        events: [pending('event-1', 'KernelTestCreated'), pending('event-2', 'KernelTestChanged')],
      },
    ])))
    await store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: secondStream,
        expectedVersion: 0,
        events: [pending('event-3', 'KernelTestCreated')],
      },
    ], 'command-2')))

    const events = await store.readAll(0, 10)
    expect(events.map(event => event.globalPosition)).toEqual([1, 2, 3])
    await expect(store.readAll(2, 10)).resolves.toMatchObject([{ eventId: 'event-3' }])
  })

  it('appends to an existing stream at its current version', async () => {
    await appendInitialEvent(store)

    const stored = await store.withTransaction(session => session.appendBatch(createBatch([
      {
        stream: firstStream,
        expectedVersion: 1,
        events: [pending('event-follow-up', 'KernelTestChanged')],
      },
    ], 'command-follow-up')))

    expect(stored).toMatchObject([{ eventId: 'event-follow-up', aggregateVersion: 2 }])
    await expect(store.loadStream(firstStream, 1)).resolves.toMatchObject([
      { eventId: 'event-follow-up', aggregateVersion: 2 },
    ])
  })

  it('accepts an empty append batch as an explicit no-op', async () => {
    await expect(store.withTransaction(session => session.appendBatch(createBatch([]))))
      .resolves
      .toEqual([])
  })

  it('rejects duplicate streams, invalid versions, and empty stream appends', async () => {
    const duplicateStreams = createBatch([
      {
        stream: firstStream,
        expectedVersion: 0,
        events: [pending('event-duplicate-a', 'KernelTestCreated')],
      },
      {
        stream: firstStream,
        expectedVersion: 0,
        events: [pending('event-duplicate-b', 'KernelTestChanged')],
      },
    ])
    await expect(store.withTransaction(session => session.appendBatch(duplicateStreams)))
      .rejects
      .toThrow('duplicate stream')

    for (const expectedVersion of [-1, 0.5]) {
      await expect(store.withTransaction(session => session.appendBatch(createBatch([
        {
          stream: firstStream,
          expectedVersion,
          events: [pending(`event-version-${expectedVersion}`, 'KernelTestCreated')],
        },
      ])))).rejects.toThrow('Invalid expected version')
    }

    await expect(store.withTransaction(session => session.appendBatch(createBatch([
      { stream: firstStream, expectedVersion: 0, events: [] },
    ])))).rejects.toThrow('empty stream append')
  })

  it('preserves optional causation metadata without inventing a project scope', async () => {
    const unscopedStream: StreamRef = {
      aggregateType: 'KernelTest',
      aggregateId: 'unscoped',
    }
    const stored = await store.withTransaction(session => session.appendBatch({
      ...createBatch([{
        stream: unscopedStream,
        expectedVersion: 0,
        events: [pending('event-unscoped', 'KernelTestCreated')],
      }]),
      causationId: 'command-parent',
    }))

    expect(stored[0]).toMatchObject({ causationId: 'command-parent' })
    expect(stored[0]).not.toHaveProperty('projectId')
    await expect(store.withTransaction(session => session.getSnapshot(unscopedStream)))
      .resolves
      .toBeNull()
    await expect(store.withTransaction(session => session.enqueueOutbox([])))
      .resolves
      .toBeUndefined()
  })

  it('stores and replaces the latest aggregate snapshot', async () => {
    const firstSnapshot: AggregateSnapshot = {
      ...firstStream,
      aggregateVersion: 10,
      schemaVersion: 1,
      state: { title: '初始标题' },
      createdAt: '2026-08-11T00:00:00.000Z',
    }
    const replacement: AggregateSnapshot = {
      ...firstSnapshot,
      aggregateVersion: 20,
      state: { title: '修订标题' },
      createdAt: '2026-08-11T00:01:00.000Z',
    }

    await store.withTransaction(async (session) => {
      await session.putSnapshot(firstSnapshot)
      await session.putSnapshot(replacement)
    })

    await expect(store.withTransaction(session => session.getSnapshot(firstStream))).resolves.toEqual(replacement)
  })

  it('rejects direct updates and deletes of stored events', async () => {
    await appendInitialEvent(store)

    await expect(sql`update domain_events set event_type = 'Tampered' where event_id = 'event-initial'`)
      .rejects
      .toThrow(/append-only/i)
    await expect(sql`delete from domain_events where event_id = 'event-initial'`)
      .rejects
      .toThrow(/append-only/i)
  })
})

function pending(eventId: string, eventType: string): PendingEvent {
  return {
    eventId,
    eventType,
    schemaVersion: 1,
    payload: { value: eventId },
    metadata: { actorType: 'system' },
    occurredAt: '2026-08-11T00:00:00.000Z',
  }
}

function createBatch(streams: AppendBatch['streams'], commandId = 'command-1'): AppendBatch {
  return {
    commandId,
    correlationId: `correlation-${commandId}`,
    streams,
  }
}

async function appendInitialEvent(store: EventStore) {
  await store.withTransaction(session => session.appendBatch(createBatch([
    {
      stream: firstStream,
      expectedVersion: 0,
      events: [pending('event-initial', 'KernelTestCreated')],
    },
  ])))
}
