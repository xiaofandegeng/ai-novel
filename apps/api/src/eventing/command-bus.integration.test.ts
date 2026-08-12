import type { EventingExecutor } from './content-protector'
import type {
  CommandEnvelope,
  CommandReceiptRecord,
  JsonObject,
  PendingEvent,
  StoredEvent,
  StreamRef,
} from './event-types'
import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { commandReceipts, domainEvents, eventOutbox } from '../db/schema'
import { ProjectDataKeyStore } from '../security/project-data-key.store'
import { resetTestDatabase } from '../test/database'
import { CommandBus } from './command-bus'
import {
  NoopEventingContentProtector,
  ProjectEventingContentProtector,
} from './content-protector'
import { DomainCommandError, UnknownCommandTypeError } from './errors'
import { EventRegistry } from './event-registry'
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

  it('encrypts a project-scoped completed receipt and decrypts its durable duplicate result', async () => {
    const { bus } = createProtectedRuntime()
    let handlerCalls = 0
    bus.register('CreateKernelThing', async (command) => {
      handlerCalls += 1
      return {
        streams: [{
          stream,
          expectedVersion: 0,
          events: [{
            ...pending('event-command-protected', 'KernelThingCreated'),
            payload: { title: command.payload.title },
          }],
        }],
        result: { id: command.aggregateId, title: command.payload.title },
      }
    })

    const first = await bus.dispatch<{ id: string, title: string }>(command())
    const second = await bus.dispatch<{ id: string, title: string }>(command())

    expect(first).toEqual({ id: 'thing-1', title: '测试对象' })
    expect(second).toEqual(first)
    expect(handlerCalls).toBe(1)
    const receipt = await readReceipt('command-1')
    expect(receipt?.result).toMatchObject({
      format: 'command-receipt-result-v1',
      receiptProtection: 'project-content',
    })
    expect(JSON.stringify(receipt?.result)).not.toContain(first.title)
  })

  it('rejects completed receipt reuse across every command identity field without replaying foreign content', async () => {
    const { bus } = createProtectedRuntime()
    let originalHandlerCalls = 0
    bus.register('CreateKernelThing', async (incoming) => {
      originalHandlerCalls += 1
      return {
        streams: [{
          stream,
          expectedVersion: 0,
          events: [{
            ...pending('event-command-identity', 'KernelThingCreated'),
            payload: { title: incoming.payload.title },
          }],
        }],
        result: { id: incoming.aggregateId, title: incoming.payload.title },
      }
    })
    await bus.dispatch(command())

    const collisions: CommandEnvelope[] = [
      {
        ...command(),
        projectId: 'project-2',
        payload: { title: '项目二' },
      },
      { ...command(), projectId: undefined },
      { ...command(), aggregateId: 'thing-2' },
      { ...command(), aggregateType: 'OtherAggregate' },
      { ...command(), commandType: 'ChangeKernelThing' },
    ]

    for (const collision of collisions) {
      await expect(bus.dispatch(collision)).rejects.toMatchObject({
        code: 'COMMAND_ID_CONFLICT',
        message: 'Command id conflicts with an existing receipt',
        details: {},
      })
    }

    expect(originalHandlerCalls).toBe(1)
    const storedEvents = await db.select().from(domainEvents)
    expect(storedEvents).toHaveLength(1)
    expect(storedEvents[0]).toMatchObject({
      aggregateType: stream.aggregateType,
      aggregateId: stream.aggregateId,
      projectId: stream.projectId,
    })
    expect(JSON.stringify(storedEvents)).not.toContain('项目二')
  })

  it('rejects an unmarked plaintext result for a project-scoped completed receipt', async () => {
    const { bus } = createProtectedRuntime()
    bus.register('CreateKernelThing', async () => {
      throw new Error('handler must not execute for a durable receipt')
    })
    await db.insert(commandReceipts).values({
      commandId: 'command-1',
      commandType: 'CreateKernelThing',
      aggregateType: stream.aggregateType,
      aggregateId: stream.aggregateId,
      projectId: stream.projectId,
      status: 'completed',
      result: { id: 'thing-1', title: '明文不可接受' },
      finishedAt: '2026-08-11T00:00:00.000Z',
    })

    await expect(bus.dispatch(command())).rejects.toThrow('receipt result format')
  })

  it('returns stable project-not-found when deletion destroys the key during protected receipt replay', async () => {
    const { bus, contentProtector } = createRacingProtectedRuntime()
    let handlerCalls = 0
    bus.register('CreateKernelThing', async (incoming) => {
      handlerCalls += 1
      return {
        streams: [{
          stream,
          expectedVersion: 0,
          events: [{
            ...pending('event-race-created', 'KernelThingCreated'),
            payload: { title: incoming.payload.title },
          }],
        }],
        result: { id: incoming.aggregateId, title: incoming.payload.title },
      }
    })
    bus.register('DeleteKernelThing', async () => ({
      streams: [{
        stream,
        expectedVersion: 1,
        events: [pending('event-race-deleted', 'KernelThingDeleted')],
      }],
      result: {
        id: stream.aggregateId,
        deleted: true,
        deletedAt: '2026-08-11T00:00:00.000Z',
      },
      receiptProtection: 'none',
    }))
    const protectedCommand = command()
    await bus.dispatch(protectedCommand)

    const pause = contentProtector.pauseNextReceiptUnprotection()
    const replay = bus.dispatch(protectedCommand)
    const replayExpectation = expect(replay).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
      message: 'Project not found',
      details: {},
    })
    await pause.reached
    await bus.dispatch({
      ...command(),
      commandId: 'command-delete-during-replay',
      commandType: 'DeleteKernelThing',
      payload: {},
    })
    pause.resume()

    await replayExpectation
    expect(handlerCalls).toBe(1)
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

  it('inserts the receipt before security finalization and rolls everything back on failure', async () => {
    const contentProtector = new ReceiptOrderingContentProtector()
    const orderingStore = new EventStore({ contentProtector })
    const bus = new CommandBus(orderingStore, new ProjectionRegistry())
    bus.register('CreateKernelThing', async () => ({
      streams: [{
        stream,
        expectedVersion: 0,
        events: [pending('event-finalization-order', 'KernelThingCreated')],
      }],
      result: { id: 'thing-1' },
      receiptProtection: 'none',
    }))

    await expect(bus.dispatch(command())).rejects.toThrow('security finalization failed')

    expect(contentProtector.receiptObserved).toBe(true)
    await expect(orderingStore.loadStream(stream)).resolves.toEqual([])
    await expect(readReceipt('command-1')).resolves.toBeUndefined()
  })

  it('runs multiple dispatched commands in one atomic unit of work', async () => {
    const bus = new CommandBus(store, new ProjectionRegistry())
    const secondStream = { ...stream, aggregateId: 'thing-2' }
    bus.register('CreateKernelThing', async command => ({
      streams: [{
        stream: command.aggregateId === secondStream.aggregateId ? secondStream : stream,
        expectedVersion: 0,
        events: [pending(`event-${command.aggregateId}`, 'KernelThingCreated')],
      }],
      result: { id: command.aggregateId },
    }))

    await expect(bus.runAtomically(async () => {
      await bus.dispatch(command())
      await bus.dispatch({ ...command(), commandId: 'command-2', aggregateId: secondStream.aggregateId })
      throw new Error('unit failed')
    })).rejects.toThrow('unit failed')

    await expect(store.loadStream(stream)).resolves.toHaveLength(0)
    await expect(store.loadStream(secondStream)).resolves.toHaveLength(0)
    await expect(readReceipt('command-1')).resolves.toBeUndefined()
    await expect(readReceipt('command-2')).resolves.toBeUndefined()
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
      errorMessage: 'Command was rejected',
    })
  })

  it('validates command identity before replaying a failed receipt', async () => {
    let handlerCalls = 0
    const bus = new CommandBus(store, new ProjectionRegistry())
    bus.register('CreateKernelThing', async () => {
      handlerCalls += 1
      throw new DomainCommandError('TITLE_REQUIRED', '不应泄露的领域错误')
    })
    await expect(bus.dispatch(command())).rejects.toMatchObject({ code: 'TITLE_REQUIRED' })

    await expect(bus.dispatch({
      ...command(),
      aggregateId: 'thing-2',
    })).rejects.toMatchObject({
      code: 'COMMAND_ID_CONFLICT',
      message: 'Command id conflicts with an existing receipt',
      details: {},
    })

    expect(handlerCalls).toBe(1)
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

  it('validates pending events before appending them', async () => {
    const events = new EventRegistry()
    events.register({
      eventType: 'KernelThingCreated',
      currentSchemaVersion: 1,
      payloadProtection: 'none',
      upcasters: {},
      validate: (payload) => {
        const value = payload as { id?: unknown }
        if (typeof value?.id !== 'string')
          throw new Error('id must be a string')
        return { id: value.id }
      },
    })
    const bus = new CommandBus(store, new ProjectionRegistry(events), events)
    bus.register('CreateKernelThing', async () => ({
      streams: [{
        stream,
        expectedVersion: 0,
        events: [{
          ...pending('event-command-invalid', 'KernelThingCreated'),
          payload: { id: 42 },
        }],
      }],
      result: { id: 'thing-1' },
    }))

    await expect(bus.dispatch(command())).rejects.toThrow('invalid payload')
    await expect(store.loadStream(stream)).resolves.toHaveLength(0)
    await expect(readReceipt('command-1')).resolves.toBeUndefined()
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

function createProtectedRuntime() {
  const events = new EventRegistry()
  events.register({
    eventType: 'KernelThingCreated',
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: payload => payload as JsonObject,
  })
  const contentProtector = new ProjectEventingContentProtector(
    events,
    new ProjectDataKeyStore(Buffer.alloc(32, 19)),
    {
      projectCreatedEventType: 'KernelThingCreated',
      projectDeletedEventType: 'KernelThingDeleted',
    },
  )
  const store = new EventStore({ contentProtector })
  const projections = new ProjectionRegistry(events)
  return {
    bus: new CommandBus(store, projections, events),
    store,
  }
}

function createRacingProtectedRuntime() {
  const events = new EventRegistry()
  events.register({
    eventType: 'KernelThingCreated',
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: payload => payload as JsonObject,
  })
  events.register({
    eventType: 'KernelThingDeleted',
    currentSchemaVersion: 1,
    payloadProtection: 'none',
    upcasters: {},
    validate: payload => payload as JsonObject,
  })
  const contentProtector = new PausingReceiptContentProtector(
    events,
    new ProjectDataKeyStore(Buffer.alloc(32, 31)),
    {
      projectCreatedEventType: 'KernelThingCreated',
      projectDeletedEventType: 'KernelThingDeleted',
    },
  )
  const store = new EventStore({
    contentProtector,
    projectDeletedEventType: 'KernelThingDeleted',
  })
  return {
    bus: new CommandBus(store, new ProjectionRegistry(events), events),
    contentProtector,
  }
}

class ReceiptOrderingContentProtector extends NoopEventingContentProtector {
  receiptObserved = false

  override async finalizeBatch(
    executor: EventingExecutor,
    events: StoredEvent[],
  ): Promise<void> {
    const commandId = events[0]?.commandId
    if (commandId) {
      const [receipt] = await executor.select({ commandId: commandReceipts.commandId })
        .from(commandReceipts)
        .where(eq(commandReceipts.commandId, commandId))
        .limit(1)
      this.receiptObserved = Boolean(receipt)
    }
    throw new Error('security finalization failed')
  }
}

class PausingReceiptContentProtector extends ProjectEventingContentProtector {
  private nextPause: {
    reached: () => void
    resume: Promise<void>
  } | null = null

  pauseNextReceiptUnprotection(): {
    reached: Promise<void>
    resume: () => void
  } {
    const reached = deferred()
    const resume = deferred()
    this.nextPause = {
      reached: reached.resolve,
      resume: resume.promise,
    }
    return {
      reached: reached.promise,
      resume: resume.resolve,
    }
  }

  override async unprotectReceiptResult(
    executor: EventingExecutor,
    receipt: CommandReceiptRecord,
  ): Promise<JsonObject> {
    const pause = this.nextPause
    this.nextPause = null
    if (pause) {
      pause.reached()
      await pause.resume
    }
    return super.unprotectReceiptResult(executor, receipt)
  }
}

function deferred(): { promise: Promise<void>, resolve: () => void } {
  let resolve = (): void => {}
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
