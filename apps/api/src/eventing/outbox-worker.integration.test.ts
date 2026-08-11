import type { OutboxIntent } from './event-types'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { eventOutbox } from '../db/schema'
import { resetTestDatabase } from '../test/database'
import { EventStore } from './event-store'
import { OutboxHandlerRegistry, OutboxWorker } from './outbox-worker'

const fixedNow = new Date('2026-08-11T00:00:00.000Z')

afterAll(() => sql.end())

describe('outboxWorker', () => {
  const store = new EventStore()

  beforeEach(resetTestDatabase)

  it('leases and completes one available message', async () => {
    const handled: Array<{ id: string, value: number }> = []
    const handlers = new OutboxHandlerRegistry()
    handlers.register('kernel-handler', async (message) => {
      handled.push({ id: message.id, value: message.payload.value as number })
    })
    await enqueue(store, intent('outbox-1', 'kernel-handler', { value: 1 }))
    const worker = createWorker('worker-1', handlers)

    expect(await worker.runOnce()).toBe(1)

    expect(handled).toEqual([{ id: 'outbox-1', value: 1 }])
    await expect(readOutbox('outbox-1')).resolves.toMatchObject({
      status: 'completed',
      attemptCount: 1,
      leaseOwner: null,
      lastError: null,
    })
  })

  it('returns a failed message to pending with exponential backoff', async () => {
    const handlers = new OutboxHandlerRegistry()
    handlers.register('kernel-handler', async () => {
      throw new Error('temporary')
    })
    await enqueue(store, intent('outbox-1', 'kernel-handler', {}))
    const worker = createWorker('worker-1', handlers)

    expect(await worker.runOnce()).toBe(1)

    const row = await readOutbox('outbox-1')
    expect(row).toMatchObject({
      status: 'pending',
      attemptCount: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: 'temporary',
    })
    expect(new Date(row!.availableAt).toISOString()).toBe('2026-08-11T00:00:01.000Z')
  })

  it('does not deliver one lease to two workers', async () => {
    let deliveries = 0
    const handlers = new OutboxHandlerRegistry()
    handlers.register('kernel-handler', async () => {
      deliveries += 1
    })
    await enqueue(store, intent('outbox-1', 'kernel-handler', {}))
    const firstWorker = createWorker('worker-1', handlers)
    const secondWorker = createWorker('worker-2', handlers)

    const counts = await Promise.all([firstWorker.runOnce(), secondWorker.runOnce()])

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
    expect(deliveries).toBe(1)
  })

  it('recovers an expired processing lease', async () => {
    let deliveries = 0
    const handlers = new OutboxHandlerRegistry()
    handlers.register('kernel-handler', async () => {
      deliveries += 1
    })
    await db.insert(eventOutbox).values({
      id: 'outbox-expired',
      eventId: 'event-outbox-expired',
      handlerName: 'kernel-handler',
      payload: {},
      status: 'processing',
      attemptCount: 1,
      availableAt: '2026-08-10T23:59:00.000Z',
      leaseOwner: 'dead-worker',
      leaseExpiresAt: '2026-08-10T23:59:59.000Z',
    })

    expect(await createWorker('worker-live', handlers).runOnce()).toBe(1)

    expect(deliveries).toBe(1)
    await expect(readOutbox('outbox-expired')).resolves.toMatchObject({
      status: 'completed',
      attemptCount: 2,
    })
  })

  it('marks an unknown handler as terminal when attempts are exhausted', async () => {
    await enqueue(store, intent('outbox-unknown', 'missing-handler', {}))
    const worker = createWorker('worker-1', new OutboxHandlerRegistry(), { maxAttempts: 1 })

    expect(await worker.runOnce()).toBe(1)

    await expect(readOutbox('outbox-unknown')).resolves.toMatchObject({
      status: 'failed',
      attemptCount: 1,
      lastError: 'Unknown outbox handler: missing-handler',
    })
  })

  it('marks a repeatedly failing message as terminal at the maximum attempt', async () => {
    let now = new Date(fixedNow)
    const handlers = new OutboxHandlerRegistry()
    handlers.register('kernel-handler', async () => {
      throw new Error('still failing')
    })
    await enqueue(store, intent('outbox-retry', 'kernel-handler', {}))
    const worker = createWorker('worker-1', handlers, {
      maxAttempts: 2,
      now: () => now,
    })

    expect(await worker.runOnce()).toBe(1)
    now = new Date('2026-08-11T00:00:01.000Z')
    expect(await worker.runOnce()).toBe(1)

    await expect(readOutbox('outbox-retry')).resolves.toMatchObject({
      status: 'failed',
      attemptCount: 2,
      lastError: 'still failing',
    })
  })

  it('keeps the first payload when the same outbox id is enqueued twice', async () => {
    await enqueue(store, intent('outbox-duplicate', 'kernel-handler', { value: 'first' }))
    await enqueue(store, intent('outbox-duplicate', 'kernel-handler', { value: 'second' }))

    await expect(readOutbox('outbox-duplicate')).resolves.toMatchObject({
      payload: { value: 'first' },
      attemptCount: 0,
    })
    const rows = await db.select().from(eventOutbox)
    expect(rows).toHaveLength(1)
  })
})

function createWorker(
  workerId: string,
  handlers: OutboxHandlerRegistry,
  overrides: { maxAttempts?: number, now?: () => Date } = {},
) {
  return new OutboxWorker({
    workerId,
    handlers,
    leaseMs: 30_000,
    maxAttempts: overrides.maxAttempts ?? 3,
    batchSize: 1,
    now: overrides.now ?? (() => fixedNow),
    backoffMs: attempt => 1_000 * 2 ** (attempt - 1),
  })
}

function intent(id: string, handlerName: string, payload: Record<string, unknown>): OutboxIntent {
  return {
    id,
    eventId: `event-${id}`,
    handlerName,
    payload,
    availableAt: '2026-08-11T00:00:00.000Z',
  }
}

async function enqueue(store: EventStore, message: OutboxIntent) {
  await store.withTransaction(session => session.enqueueOutbox([message]))
}

async function readOutbox(id: string) {
  const [row] = await db.select().from(eventOutbox).where(eq(eventOutbox.id, id)).limit(1)
  return row
}
