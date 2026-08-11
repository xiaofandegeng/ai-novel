import type { CommandEnvelope, JsonObject, PendingEvent, StreamRef } from './event-types'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { commandReceipts, eventOutbox } from '../db/schema'
import { resetTestDatabase } from '../test/database'
import { CommandBus } from './command-bus'
import { DomainCommandError, UnknownCommandTypeError } from './errors'
import { EventStore } from './event-store'
import { ProjectionRegistry } from './projection-runner'

const stream: StreamRef = {
  aggregateType: 'KernelCommandTest',
  aggregateId: 'thing-1',
  projectId: 'project-1',
}

afterAll(() => sql.end())

describe('commandBus', () => {
  const store = new EventStore()

  beforeEach(resetTestDatabase)

  it('commits events, synchronous projections, outbox effects, and the receipt together', async () => {
    const projected: string[] = []
    const projections = new ProjectionRegistry()
    projections.register({
      name: 'kernel-command-projection',
      mode: 'sync',
      handles: ['KernelThingCreated'],
      project: async (_transaction, event) => {
        projected.push(event.eventId)
      },
    })
    const bus = new CommandBus(store, projections)
    bus.register('CreateKernelThing', async command => ({
      streams: [{
        stream,
        expectedVersion: 0,
        events: [pending('event-command-1', 'KernelThingCreated')],
      }],
      result: { id: command.aggregateId },
      outbox: [{
        id: 'outbox-command-1',
        eventId: 'event-command-1',
        handlerName: 'kernel-effect',
        payload: { id: command.aggregateId },
      }],
    }))

    await expect(bus.dispatch<{ id: string }>(command())).resolves.toEqual({ id: 'thing-1' })

    expect(projected).toEqual(['event-command-1'])
    await expect(store.loadStream(stream)).resolves.toMatchObject([
      { eventId: 'event-command-1', projectId: 'project-1' },
    ])
    await expect(readReceipt('command-1')).resolves.toMatchObject({
      status: 'completed',
      result: { id: 'thing-1' },
    })
    await expect(db.select().from(eventOutbox)).resolves.toMatchObject([
      { id: 'outbox-command-1', status: 'pending' },
    ])
  })

  it('returns the stored result without calling the handler for a completed duplicate command', async () => {
    let handlerCalls = 0
    const bus = new CommandBus(store, new ProjectionRegistry())
    bus.register('CreateKernelThing', async () => {
      handlerCalls += 1
      return {
        streams: [{
          stream,
          expectedVersion: 0,
          events: [pending('event-command-1', 'KernelThingCreated')],
        }],
        result: { id: 'thing-1' },
      }
    })

    const first = await bus.dispatch<{ id: string }>(command())
    const second = await bus.dispatch<{ id: string }>(command())

    expect(second).toEqual(first)
    expect(handlerCalls).toBe(1)
    await expect(store.loadStream(stream)).resolves.toHaveLength(1)
  })

  it('rolls back events, outbox, and receipt when a synchronous projector fails', async () => {
    const projections = new ProjectionRegistry()
    projections.register({
      name: 'kernel-failing-sync',
      mode: 'sync',
      handles: ['KernelThingCreated'],
      project: async () => {
        throw new Error('projection failed')
      },
    })
    const bus = new CommandBus(store, projections)
    bus.register('CreateKernelThing', async () => ({
      streams: [{
        stream,
        expectedVersion: 0,
        events: [pending('event-command-1', 'KernelThingCreated')],
      }],
      result: { id: 'thing-1' },
      outbox: [{
        id: 'outbox-command-1',
        eventId: 'event-command-1',
        handlerName: 'kernel-effect',
        payload: {},
      }],
    }))

    await expect(bus.dispatch(command())).rejects.toThrow('projection failed')

    await expect(store.loadStream(stream)).resolves.toHaveLength(0)
    await expect(db.select().from(eventOutbox)).resolves.toHaveLength(0)
    await expect(readReceipt('command-1')).resolves.toBeUndefined()
  })

  it('persists a deterministic domain rejection and does not execute it twice', async () => {
    let handlerCalls = 0
    const bus = new CommandBus(store, new ProjectionRegistry())
    bus.register('CreateKernelThing', async () => {
      handlerCalls += 1
      throw new DomainCommandError('TITLE_REQUIRED', '标题不能为空', { field: 'title' })
    })

    await expect(bus.dispatch(command())).rejects.toMatchObject({ code: 'TITLE_REQUIRED' })
    await expect(bus.dispatch(command())).rejects.toMatchObject({ code: 'TITLE_REQUIRED' })

    expect(handlerCalls).toBe(1)
    await expect(readReceipt('command-1')).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'TITLE_REQUIRED',
      errorMessage: '标题不能为空',
    })
  })

  it('does not persist a transient failure and allows the same command to retry', async () => {
    let handlerCalls = 0
    const bus = new CommandBus(store, new ProjectionRegistry())
    bus.register('CreateKernelThing', async () => {
      handlerCalls += 1
      if (handlerCalls === 1)
        throw new Error('temporary database failure')
      return {
        streams: [{
          stream,
          expectedVersion: 0,
          events: [pending('event-command-1', 'KernelThingCreated')],
        }],
        result: { id: 'thing-1' },
      }
    })

    await expect(bus.dispatch(command())).rejects.toThrow('temporary database failure')
    await expect(readReceipt('command-1')).resolves.toBeUndefined()
    await expect(bus.dispatch<{ id: string }>(command())).resolves.toEqual({ id: 'thing-1' })
    expect(handlerCalls).toBe(2)
  })

  it('rejects a stream outside the command project scope', async () => {
    const bus = new CommandBus(store, new ProjectionRegistry())
    bus.register('CreateKernelThing', async () => ({
      streams: [{
        stream: { ...stream, projectId: 'project-2' },
        expectedVersion: 0,
        events: [pending('event-command-1', 'KernelThingCreated')],
      }],
      result: { id: 'thing-1' },
    }))

    await expect(bus.dispatch(command())).rejects.toMatchObject({ code: 'PROJECT_SCOPE_MISMATCH' })
    await expect(store.loadStream(stream)).resolves.toHaveLength(0)
  })

  it('rejects an unregistered command type', async () => {
    const bus = new CommandBus(store, new ProjectionRegistry())

    await expect(bus.dispatch({ ...command(), commandType: 'MissingCommand' }))
      .rejects
      .toBeInstanceOf(UnknownCommandTypeError)
  })

  it('rejects duplicate handler registration', () => {
    const bus = new CommandBus(store, new ProjectionRegistry())
    const handler = async () => ({ streams: [], result: {} })
    bus.register('CreateKernelThing', handler)

    expect(() => bus.register('CreateKernelThing', handler)).toThrow('already registered')
  })

  it('supports an unscoped command with causation metadata', async () => {
    const unscopedStream: StreamRef = {
      aggregateType: 'KernelCommandTest',
      aggregateId: 'thing-unscoped',
    }
    const bus = new CommandBus(store, new ProjectionRegistry())
    bus.register('CreateUnscopedKernelThing', async () => ({
      streams: [{
        stream: unscopedStream,
        expectedVersion: 0,
        events: [pending('event-unscoped', 'KernelThingCreated')],
      }],
      result: { id: unscopedStream.aggregateId },
    }))

    await expect(bus.dispatch({
      ...command(),
      commandId: 'command-unscoped',
      commandType: 'CreateUnscopedKernelThing',
      aggregateId: unscopedStream.aggregateId,
      projectId: undefined,
      causationId: 'command-parent',
    })).resolves.toEqual({ id: 'thing-unscoped' })
    await expect(store.loadStream(unscopedStream)).resolves.toMatchObject([
      { eventId: 'event-unscoped', causationId: 'command-parent' },
    ])
  })
})

function command(): CommandEnvelope {
  return {
    commandId: 'command-1',
    commandType: 'CreateKernelThing',
    aggregateType: stream.aggregateType,
    aggregateId: stream.aggregateId,
    projectId: stream.projectId,
    correlationId: 'correlation-command-1',
    payload: { title: '测试对象' },
  }
}

function pending(eventId: string, eventType: string): PendingEvent {
  return {
    eventId,
    eventType,
    schemaVersion: 1,
    payload: { id: stream.aggregateId },
    metadata: { actorType: 'system' },
    occurredAt: '2026-08-11T00:00:00.000Z',
  }
}

async function readReceipt(commandId: string): Promise<JsonObject | undefined> {
  const [receipt] = await db.select()
    .from(commandReceipts)
    .where(eq(commandReceipts.commandId, commandId))
    .limit(1)
  return receipt
}
