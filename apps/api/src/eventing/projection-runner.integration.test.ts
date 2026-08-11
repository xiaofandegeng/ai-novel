import type { AppendBatch, PendingEvent, StreamRef } from './event-types'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { projectionCheckpoints } from '../db/schema'
import { resetTestDatabase } from '../test/database'
import { DuplicateProjectionError, UnknownProjectionError } from './errors'
import { EventStore } from './event-store'
import { ProjectionRegistry, ProjectionRunner } from './projection-runner'

const stream: StreamRef = {
  aggregateType: 'KernelProjectionTest',
  aggregateId: 'projection-1',
  projectId: 'project-1',
}

afterAll(() => sql.end())

describe('projectionRegistry', () => {
  const store = new EventStore()

  beforeEach(resetTestDatabase)

  it('runs matching synchronous projectors in global event order', async () => {
    const registry = new ProjectionRegistry()
    const seen: number[] = []
    registry.register({
      name: 'kernel-sync',
      mode: 'sync',
      handles: ['KernelCreated', 'KernelChanged'],
      project: async (_transaction, event) => {
        seen.push(event.globalPosition)
      },
    })
    const stored = await appendEvents(store, [
      pending('event-1', 'KernelCreated'),
      pending('event-2', 'IgnoredEvent'),
      pending('event-3', 'KernelChanged'),
    ])

    await store.withTransaction(session => registry.projectSync(
      session.transaction,
      [stored[2], stored[0], stored[1]],
    ))

    expect(seen).toEqual([1, 3])
  })

  it('rejects duplicate projection names', () => {
    const registry = new ProjectionRegistry()
    const definition = {
      name: 'duplicate-projection',
      mode: 'sync' as const,
      handles: ['KernelCreated'],
      project: async () => {},
    }
    registry.register(definition)

    expect(() => registry.register(definition)).toThrow(DuplicateProjectionError)
  })

  it('rejects a request for an unknown projection', () => {
    expect(() => new ProjectionRegistry().get('missing')).toThrow(UnknownProjectionError)
  })
})

describe('projectionRunner', () => {
  const store = new EventStore()

  beforeEach(resetTestDatabase)

  it('resumes an asynchronous projection after its checkpoint', async () => {
    const registry = new ProjectionRegistry()
    const seen: string[] = []
    registry.register({
      name: 'kernel-async',
      mode: 'async',
      handles: ['KernelCreated', 'KernelChanged'],
      project: async (_transaction, event) => {
        seen.push(event.eventId)
      },
    })
    await appendEvents(store, [
      pending('event-1', 'KernelCreated'),
      pending('event-2', 'IgnoredEvent'),
      pending('event-3', 'KernelChanged'),
    ])
    const runner = new ProjectionRunner(registry, store)

    expect(await runner.runBatch('kernel-async', 2)).toBe(2)
    expect(await runner.runBatch('kernel-async', 2)).toBe(1)

    expect(seen).toEqual(['event-1', 'event-3'])
    await expect(readCheckpoint('kernel-async')).resolves.toMatchObject({
      lastGlobalPosition: 3,
      status: 'idle',
      lastError: null,
    })
  })

  it('does not advance the checkpoint when a projector fails', async () => {
    const registry = new ProjectionRegistry()
    registry.register({
      name: 'kernel-failing',
      mode: 'async',
      handles: ['KernelCreated'],
      project: async () => {
        throw new Error('projection failed')
      },
    })
    await appendEvents(store, [pending('event-1', 'KernelCreated')])
    const runner = new ProjectionRunner(registry, store)

    await expect(runner.runBatch('kernel-failing', 10)).rejects.toThrow('projection failed')
    await expect(readCheckpoint('kernel-failing')).resolves.toMatchObject({
      lastGlobalPosition: 0,
      status: 'failed',
      lastError: 'projection failed',
    })
  })

  it('resets projection state and its checkpoint', async () => {
    const registry = new ProjectionRegistry()
    let projectedCount = 0
    let resetCount = 0
    registry.register({
      name: 'kernel-resettable',
      mode: 'async',
      handles: ['KernelCreated'],
      project: async () => {
        projectedCount += 1
      },
      reset: async () => {
        projectedCount = 0
        resetCount += 1
      },
    })
    await appendEvents(store, [pending('event-1', 'KernelCreated')])
    const runner = new ProjectionRunner(registry, store)
    await runner.runBatch('kernel-resettable', 10)

    await runner.reset('kernel-resettable')

    expect(projectedCount).toBe(0)
    expect(resetCount).toBe(1)
    await expect(readCheckpoint('kernel-resettable')).resolves.toMatchObject({
      lastGlobalPosition: 0,
      status: 'idle',
      lastError: null,
    })
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

async function appendEvents(store: EventStore, events: PendingEvent[]) {
  const batch: AppendBatch = {
    commandId: `command-${events[0]?.eventId ?? 'empty'}`,
    correlationId: 'projection-test-correlation',
    streams: [{ stream, expectedVersion: 0, events }],
  }
  return store.withTransaction(session => session.appendBatch(batch))
}

async function readCheckpoint(projectionName: string) {
  const [checkpoint] = await db.select()
    .from(projectionCheckpoints)
    .where(eq(projectionCheckpoints.projectionName, projectionName))
    .limit(1)
  return checkpoint
}
