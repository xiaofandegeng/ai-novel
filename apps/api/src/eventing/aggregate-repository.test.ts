import type { AggregateDefinition } from './aggregate-repository'
import type { AppendBatch, JsonObject, PendingEvent, StreamRef } from './event-types'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from '../db'
import { resetTestDatabase } from '../test/database'
import { AggregateRepository } from './aggregate-repository'
import { InvalidSnapshotError, UnknownEventTypeError } from './errors'
import { EventRegistry } from './event-registry'
import { EventStore } from './event-store'

const stream: StreamRef = {
  aggregateType: 'KernelAggregate',
  aggregateId: 'aggregate-1',
  projectId: 'project-1',
}

afterAll(() => sql.end())

describe('aggregateRepository', () => {
  const store = new EventStore()

  beforeEach(resetTestDatabase)

  it('decodes and upcasts stream events before reducing aggregate state', async () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTitleSet',
      currentSchemaVersion: 2,
      upcasters: {
        1: payload => ({ title: readString(payload, 'legacyTitle') }),
      },
      validate: payload => ({ title: readString(payload, 'title') }),
    })
    const repository = new AggregateRepository(store, registry)
    const definition = titleDefinition()
    await append([
      pending('event-title-1', 'KernelTitleSet', { legacyTitle: '初始标题' }, 1),
      pending('event-title-2', 'KernelTitleSet', { title: '修订标题' }, 2),
    ])

    await expect(repository.load(definition, stream)).resolves.toEqual({
      state: { title: '修订标题' },
      version: 2,
    })
  })

  it('starts from a snapshot and applies only later events', async () => {
    const registry = countRegistry()
    const evolve = vi.fn((state: JsonObject, event: { payload: JsonObject }) => ({
      count: readNumber(state, 'count') + readNumber(event.payload, 'delta'),
    }))
    const definition: AggregateDefinition<JsonObject> = {
      aggregateType: stream.aggregateType,
      initialState: () => ({ count: 0 }),
      evolve,
      snapshotEvery: 100,
      snapshotSchemaVersion: 1,
    }
    const repository = new AggregateRepository(store, registry)
    await append(Array.from({ length: 12 }, (_, index) => (
      pending(`event-count-${index + 1}`, 'KernelCounted', { delta: 1 })
    )))
    await store.withTransaction(session => session.putSnapshot({
      ...stream,
      aggregateVersion: 10,
      schemaVersion: 1,
      state: { count: 10 },
      createdAt: '2026-08-11T00:00:00.000Z',
    }))

    await expect(repository.load(definition, stream)).resolves.toEqual({
      state: { count: 12 },
      version: 12,
    })
    expect(evolve).toHaveBeenCalledTimes(2)
  })

  it('returns a fresh initial state for an empty stream', async () => {
    const repository = new AggregateRepository(store, new EventRegistry())

    await expect(repository.load(titleDefinition(), stream)).resolves.toEqual({
      state: { title: '' },
      version: 0,
    })
  })

  it('rejects an event type that is absent from the registry', async () => {
    const repository = new AggregateRepository(store, new EventRegistry())
    await append([pending('event-unknown', 'KernelUnknown', {})])

    await expect(repository.load(titleDefinition(), stream))
      .rejects
      .toBeInstanceOf(UnknownEventTypeError)
  })

  it('rejects a snapshot with an unsupported schema version', async () => {
    const repository = new AggregateRepository(store, countRegistry())
    await append([pending('event-count-1', 'KernelCounted', { delta: 1 })])
    await store.withTransaction(session => session.putSnapshot({
      ...stream,
      aggregateVersion: 1,
      schemaVersion: 2,
      state: { count: 1 },
      createdAt: '2026-08-11T00:00:00.000Z',
    }))

    await expect(repository.load(countDefinition(), stream))
      .rejects
      .toBeInstanceOf(InvalidSnapshotError)
  })

  it('creates a disposable snapshot after the configured event interval', async () => {
    const repository = new AggregateRepository(store, countRegistry())
    await append([
      pending('event-count-1', 'KernelCounted', { delta: 1 }),
      pending('event-count-2', 'KernelCounted', { delta: 1 }),
    ])

    await expect(repository.load(countDefinition(2), stream)).resolves.toEqual({
      state: { count: 2 },
      version: 2,
    })
    await expect(store.withTransaction(session => session.getSnapshot(stream))).resolves.toMatchObject({
      aggregateVersion: 2,
      schemaVersion: 1,
      state: { count: 2 },
    })
  })

  it('rejects aggregate definitions with mismatched or invalid version settings', async () => {
    const repository = new AggregateRepository(store, new EventRegistry())
    await expect(repository.load({
      ...titleDefinition(),
      aggregateType: 'DifferentAggregate',
    }, stream)).rejects.toThrow('cannot load stream')
    await expect(repository.load({
      ...titleDefinition(),
      snapshotEvery: 0,
    }, stream)).rejects.toThrow('Snapshot interval')
    await expect(repository.load({
      ...titleDefinition(),
      snapshotSchemaVersion: 0.5,
    }, stream)).rejects.toThrow('Snapshot schema version')
  })

  it('loads through an existing event store session without opening another transaction', async () => {
    const repository = new AggregateRepository(store, countRegistry())
    await append([pending('event-session-1', 'KernelCounted', { delta: 1 })])

    await expect(store.withTransaction(session => (
      repository.loadInSession(session, countDefinition(), stream)
    ))).resolves.toEqual({ state: { count: 1 }, version: 1 })
  })
})

function titleDefinition(): AggregateDefinition<JsonObject> {
  return {
    aggregateType: stream.aggregateType,
    initialState: () => ({ title: '' }),
    evolve: (_state, event) => ({ title: readString(event.payload, 'title') }),
    snapshotEvery: 100,
    snapshotSchemaVersion: 1,
  }
}

function countDefinition(snapshotEvery = 100): AggregateDefinition<JsonObject> {
  return {
    aggregateType: stream.aggregateType,
    initialState: () => ({ count: 0 }),
    evolve: (state, event) => ({
      count: readNumber(state, 'count') + readNumber(event.payload, 'delta'),
    }),
    snapshotEvery,
    snapshotSchemaVersion: 1,
  }
}

function countRegistry(): EventRegistry {
  const registry = new EventRegistry()
  registry.register({
    eventType: 'KernelCounted',
    currentSchemaVersion: 1,
    upcasters: {},
    validate: payload => ({ delta: readNumber(payload, 'delta') }),
  })
  return registry
}

async function append(events: PendingEvent[]): Promise<void> {
  const store = new EventStore()
  await store.withTransaction(session => session.appendBatch(batch(events)))
}

function batch(events: PendingEvent[]): AppendBatch {
  return {
    commandId: `command-${events[0]?.eventId ?? 'empty'}`,
    correlationId: 'correlation-aggregate-repository',
    streams: [{ stream, expectedVersion: 0, events }],
  }
}

function pending(
  eventId: string,
  eventType: string,
  payload: JsonObject,
  schemaVersion = 1,
): PendingEvent {
  return {
    eventId,
    eventType,
    schemaVersion,
    payload,
    metadata: { actorType: 'system' },
    occurredAt: '2026-08-11T00:00:00.000Z',
  }
}

function readString(value: unknown, key: string): string {
  const field = readObject(value)[key]
  if (typeof field !== 'string')
    throw new Error(`${key} must be a string`)
  return field
}

function readNumber(value: unknown, key: string): number {
  const field = readObject(value)[key]
  if (typeof field !== 'number')
    throw new Error(`${key} must be a number`)
  return field
}

function readObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('value must be an object')
  return value as JsonObject
}
