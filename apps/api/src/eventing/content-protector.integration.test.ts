import type {
  AggregateSnapshot,
  CommandEnvelope,
  CommandReceiptRecord,
  JsonObject,
  StoredEvent,
} from './event-types'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { projectDataKeys } from '../db/schema'
import { ProjectDataKeyDestroyedError, ProjectDataKeyStore } from '../security/project-data-key.store'
import { resetTestDatabase } from '../test/database'
import {
  NoopEventingContentProtector,
  ProjectEventingContentProtector,
} from './content-protector'
import { EventRegistry } from './event-registry'
import { EventStore } from './event-store'

afterAll(() => sql.end())

const PROJECT_CREATED = 'FixtureProjectCreated'
const PROJECT_DELETED = 'FixtureProjectDeleted'

describe('project eventing content protector', () => {
  const store = new EventStore()
  const keys = new ProjectDataKeyStore()
  const registry = createRegistry()
  const protector = new ProjectEventingContentProtector(registry, keys, {
    projectCreatedEventType: PROJECT_CREATED,
    projectDeletedEventType: PROJECT_DELETED,
  })

  beforeEach(resetTestDatabase)

  it('protects project event payloads without retaining plaintext and restores the original object', async () => {
    const plaintext = { chapter: '只有数据库不应看见的正文' }

    await store.withTransaction(async (session) => {
      const event = storedEvent({ eventType: PROJECT_CREATED, payload: plaintext })
      const protectedPayload = await protector.protectEvent(session.transaction, event)

      expect(JSON.stringify(protectedPayload)).not.toContain(plaintext.chapter)
      await expect(protector.unprotectEvent(session.transaction, {
        ...event,
        payload: protectedPayload,
      })).resolves.toEqual(plaintext)
    })
  })

  it('authenticates protected events against their stable event headers', async () => {
    await store.withTransaction(async (session) => {
      const event = storedEvent({
        eventType: PROJECT_CREATED,
        payload: { chapter: '雾港第一章' },
      })
      const protectedPayload = await protector.protectEvent(session.transaction, event)

      await expect(protector.unprotectEvent(session.transaction, {
        ...event,
        eventId: 'event-moved',
        payload: protectedPayload,
      })).rejects.toThrow()
    })
  })

  it('uses an injective event AAD encoding when identifiers contain delimiters', async () => {
    await store.withTransaction(async (session) => {
      const event = storedEvent({
        eventId: 'event|Project',
        aggregateType: 'one',
        eventType: PROJECT_CREATED,
        payload: { chapter: '分隔符不能改变身份边界' },
      })
      const protectedPayload = await protector.protectEvent(session.transaction, event)

      await expect(protector.unprotectEvent(session.transaction, {
        ...event,
        eventId: 'event',
        aggregateType: 'Project|one',
        payload: protectedPayload,
      })).rejects.toThrow()
    })
  })

  it('does not create a project key for a protected event other than project creation', async () => {
    await store.withTransaction(async (session) => {
      const event = storedEvent({
        eventType: 'SecretChanged',
        payload: { chapter: '未经创建的项目正文' },
      })

      await expect(protector.protectEvent(session.transaction, event)).rejects.toThrow(
        'Project data key does not exist',
      )
    })

    await expect(db.select().from(projectDataKeys)).resolves.toEqual([])
  })

  it('leaves unprotected lifecycle payloads unchanged without creating a key', async () => {
    const event = storedEvent({
      eventType: PROJECT_DELETED,
      payload: { deletedAt: '2026-08-12T00:00:00.000Z' },
    })

    await store.withTransaction(async (session) => {
      await expect(protector.protectEvent(session.transaction, event)).resolves.toBe(event.payload)
      await expect(protector.unprotectEvent(session.transaction, event)).resolves.toBe(event.payload)
    })
    await expect(db.select().from(projectDataKeys)).resolves.toEqual([])
  })

  it('protects project snapshots and completed receipt results with separate authenticated contexts', async () => {
    await store.withTransaction(async (session) => {
      await protector.protectEvent(session.transaction, storedEvent({
        eventType: PROJECT_CREATED,
        payload: { title: '雾港' },
      }))
      const snapshot = aggregateSnapshot({ state: { draft: '不应被看见的快照' } })
      const command = commandEnvelope()
      const result = { title: '不应被看见的回执' }

      const protectedSnapshot = await protector.protectSnapshot(session.transaction, snapshot)
      const protectedReceipt = await protector.protectReceiptResult(session.transaction, command, result)

      expect(JSON.stringify(protectedSnapshot)).not.toContain(snapshot.state.draft)
      expect(JSON.stringify(protectedReceipt)).not.toContain(result.title)
      await expect(protector.unprotectSnapshot(session.transaction, {
        ...snapshot,
        state: protectedSnapshot,
      })).resolves.toEqual(snapshot.state)
      await expect(protector.unprotectReceiptResult(session.transaction, receiptRecord({
        ...command,
        result: protectedReceipt,
      }))).resolves.toEqual(result)
      await expect(protector.unprotectReceiptResult(session.transaction, receiptRecord({
        ...command,
        commandId: 'command-moved',
        result: protectedReceipt,
      }))).rejects.toThrow()
    })
  })

  it('authenticates snapshots against every aggregate identity, version, and project header', async () => {
    await store.withTransaction(async (session) => {
      await protector.protectEvent(session.transaction, storedEvent({
        eventType: PROJECT_CREATED,
        payload: { title: '雾港' },
      }))
      await protector.protectEvent(session.transaction, storedEvent({
        eventId: 'event-project-b',
        aggregateId: 'project-b',
        projectId: 'project-b',
        eventType: PROJECT_CREATED,
        payload: { title: '山城' },
      }))
      const snapshot = aggregateSnapshot({ state: { draft: '快照内容' } })
      const protectedState = await protector.protectSnapshot(session.transaction, snapshot)
      const mutations: Array<Partial<AggregateSnapshot>> = [
        { aggregateType: 'Project|Moved' },
        { aggregateId: 'project-moved' },
        { aggregateVersion: 2 },
        { schemaVersion: 2 },
        { projectId: 'project-b' },
      ]

      for (const mutation of mutations) {
        await expect(protector.unprotectSnapshot(session.transaction, {
          ...snapshot,
          ...mutation,
          state: protectedState,
        })).rejects.toThrow()
      }
    })
  })

  it('leaves non-project snapshots and receipt results unchanged', async () => {
    const snapshot = aggregateSnapshot({ projectId: undefined, state: { status: 'global' } })
    const command = commandEnvelope({ projectId: undefined })
    const result = { status: 'global' }

    await store.withTransaction(async (session) => {
      await expect(protector.protectSnapshot(session.transaction, snapshot)).resolves.toBe(snapshot.state)
      await expect(protector.unprotectSnapshot(session.transaction, snapshot)).resolves.toBe(snapshot.state)
      await expect(protector.protectReceiptResult(session.transaction, command, result)).resolves.toBe(result)
      await expect(protector.unprotectReceiptResult(session.transaction, receiptRecord({
        ...command,
        result,
      }))).resolves.toBe(result)
    })
  })

  it('rejects plaintext substitution for a protected project receipt', async () => {
    await store.withTransaction(async (session) => {
      await protector.protectEvent(session.transaction, storedEvent({
        eventType: PROJECT_CREATED,
        payload: { title: '雾港' },
      }))
      await expect(protector.unprotectReceiptResult(session.transaction, receiptRecord({
        result: { title: '被替换的明文回执' },
      }))).rejects.toThrow()
    })
  })

  it('destroys the project key only when the configured deletion event is finalized', async () => {
    await store.withTransaction(async (session) => {
      await protector.protectEvent(session.transaction, storedEvent({
        eventType: PROJECT_CREATED,
        payload: { title: '雾港' },
      }))
      await protector.finalizeBatch(session.transaction, [storedEvent({
        eventType: 'SecretChanged',
        payload: { value: 'still-active' },
      })])
      await expect(keys.resolve(session.transaction, 'project-a')).resolves.toMatchObject({ keyVersion: 1 })

      await protector.finalizeBatch(session.transaction, [storedEvent({
        eventType: PROJECT_DELETED,
        payload: { deletedAt: '2026-08-12T08:30:00.000Z' },
        occurredAt: '2026-08-12T08:30:00.000Z',
      })])
    })

    await expect(keys.resolve(db, 'project-a')).rejects.toBeInstanceOf(ProjectDataKeyDestroyedError)
  })
})

describe('noop eventing content protector', () => {
  it('preserves every payload and performs no batch finalization', async () => {
    const protector = new NoopEventingContentProtector()
    const store = new EventStore()
    const event = storedEvent({ eventType: 'Unknown', payload: { value: 'event' } })
    const snapshot = aggregateSnapshot({ state: { value: 'snapshot' } })
    const command = commandEnvelope()
    const result = { value: 'receipt' }

    await store.withTransaction(async (session) => {
      await expect(protector.protectEvent(session.transaction, event)).resolves.toBe(event.payload)
      await expect(protector.unprotectEvent(session.transaction, event)).resolves.toBe(event.payload)
      await expect(protector.protectSnapshot(session.transaction, snapshot)).resolves.toBe(snapshot.state)
      await expect(protector.unprotectSnapshot(session.transaction, snapshot)).resolves.toBe(snapshot.state)
      await expect(protector.protectReceiptResult(session.transaction, command, result)).resolves.toBe(result)
      await expect(protector.unprotectReceiptResult(session.transaction, receiptRecord({
        ...command,
        result,
      }))).resolves.toBe(result)
      await expect(protector.finalizeBatch(session.transaction, [event])).resolves.toBeUndefined()
    })
  })
})

function createRegistry(): EventRegistry {
  const registry = new EventRegistry()
  for (const eventType of [PROJECT_CREATED, 'SecretChanged']) {
    registry.register({
      eventType,
      currentSchemaVersion: 1,
      payloadProtection: 'project-content',
      upcasters: {},
      validate: payload => payload as JsonObject,
    })
  }
  registry.register({
    eventType: PROJECT_DELETED,
    currentSchemaVersion: 1,
    payloadProtection: 'none',
    upcasters: {},
    validate: payload => payload as JsonObject,
  })
  return registry
}

function storedEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    globalPosition: 1,
    eventId: 'event-1',
    aggregateType: 'Project',
    aggregateId: 'project-a',
    aggregateVersion: 1,
    projectId: 'project-a',
    eventType: PROJECT_CREATED,
    schemaVersion: 1,
    payload: {},
    metadata: {},
    commandId: 'command-1',
    eventIndex: 0,
    correlationId: 'correlation-1',
    occurredAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  }
}

function aggregateSnapshot(overrides: Partial<AggregateSnapshot> = {}): AggregateSnapshot {
  return {
    aggregateType: 'Project',
    aggregateId: 'project-a',
    projectId: 'project-a',
    aggregateVersion: 1,
    schemaVersion: 1,
    state: {},
    createdAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  }
}

function commandEnvelope(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    commandId: 'command-1',
    commandType: 'CreateProject',
    aggregateType: 'Project',
    aggregateId: 'project-a',
    projectId: 'project-a',
    correlationId: 'correlation-1',
    payload: {},
    ...overrides,
  }
}

function receiptRecord(overrides: Partial<CommandReceiptRecord> = {}): CommandReceiptRecord {
  return {
    commandId: 'command-1',
    commandType: 'CreateProject',
    aggregateType: 'Project',
    aggregateId: 'project-a',
    projectId: 'project-a',
    status: 'completed',
    result: {},
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-08-12T00:00:00.000Z',
    finishedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  }
}
