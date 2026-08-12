import type { JsonObject } from './event-types'
import { and, asc, eq, lt, lte, or, sql as sqlFragment } from 'drizzle-orm'
import { db } from '../db'
import { eventOutbox } from '../db/schema'
import { errorMessage } from '../shared/utils'
import { DuplicateOutboxHandlerError, UnknownOutboxHandlerError } from './errors'

export interface OutboxMessage {
  id: string
  eventId: string
  handlerName: string
  payload: JsonObject
  attemptCount: number
}

export type OutboxHandler = (message: OutboxMessage) => Promise<void>

export class OutboxHandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>()

  register(handlerName: string, handler: OutboxHandler): void {
    if (this.handlers.has(handlerName))
      throw new DuplicateOutboxHandlerError(handlerName)
    this.handlers.set(handlerName, handler)
  }

  get(handlerName: string): OutboxHandler {
    const handler = this.handlers.get(handlerName)
    if (!handler)
      throw new UnknownOutboxHandlerError(handlerName)
    return handler
  }
}

export interface OutboxWorkerOptions {
  workerId: string
  handlers: OutboxHandlerRegistry
  leaseMs?: number
  maxAttempts?: number
  batchSize?: number
  now?: () => Date
  backoffMs?: (attemptCount: number) => number
}

export class OutboxWorker {
  private readonly leaseMs: number
  private readonly maxAttempts: number
  private readonly batchSize: number
  private readonly now: () => Date
  private readonly backoffMs: (attemptCount: number) => number

  constructor(private readonly options: OutboxWorkerOptions) {
    this.leaseMs = positiveInteger(options.leaseMs ?? 30_000, 'leaseMs')
    this.maxAttempts = positiveInteger(options.maxAttempts ?? 5, 'maxAttempts')
    this.batchSize = positiveInteger(options.batchSize ?? 10, 'batchSize')
    this.now = options.now ?? (() => new Date())
    this.backoffMs = options.backoffMs ?? (attemptCount => Math.min(60_000, 1_000 * 2 ** (attemptCount - 1)))
  }

  async runOnce(): Promise<number> {
    const messages = await this.claim()
    for (const message of messages) {
      try {
        const handler = this.options.handlers.get(message.handlerName)
        await handler(message)
        await this.complete(message.id)
      }
      catch (error: unknown) {
        await this.fail(message, error)
      }
    }
    return messages.length
  }

  private async claim(): Promise<OutboxMessage[]> {
    const now = this.now()
    const nowString = now.toISOString()
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString()

    return db.transaction(async (transaction) => {
      const candidates = await transaction.select()
        .from(eventOutbox)
        .where(and(
          lt(eventOutbox.attemptCount, this.maxAttempts),
          or(
            and(
              eq(eventOutbox.status, 'pending'),
              lte(eventOutbox.availableAt, nowString),
            ),
            and(
              eq(eventOutbox.status, 'processing'),
              lte(eventOutbox.leaseExpiresAt, nowString),
            ),
          ),
        ))
        .orderBy(asc(eventOutbox.availableAt), asc(eventOutbox.createdAt))
        .limit(this.batchSize)
        .for('update', { skipLocked: true })

      const claimed: OutboxMessage[] = []
      for (const candidate of candidates) {
        const [updated] = await transaction.update(eventOutbox)
          .set({
            status: 'processing',
            attemptCount: sqlFragment`${eventOutbox.attemptCount} + 1`,
            leaseOwner: this.options.workerId,
            leaseExpiresAt,
          })
          .where(eq(eventOutbox.id, candidate.id))
          .returning()
        if (updated) {
          claimed.push({
            id: updated.id,
            eventId: updated.eventId,
            handlerName: updated.handlerName,
            payload: updated.payload,
            attemptCount: updated.attemptCount,
          })
        }
      }
      return claimed
    })
  }

  private async complete(id: string): Promise<void> {
    await db.update(eventOutbox)
      .set({
        status: 'completed',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        completedAt: this.now().toISOString(),
      })
      .where(and(
        eq(eventOutbox.id, id),
        eq(eventOutbox.status, 'processing'),
        eq(eventOutbox.leaseOwner, this.options.workerId),
      ))
  }

  private async fail(message: OutboxMessage, error: unknown): Promise<void> {
    const terminal = message.attemptCount >= this.maxAttempts
    const nextAvailableAt = new Date(
      this.now().getTime() + this.backoffMs(message.attemptCount),
    ).toISOString()
    await db.update(eventOutbox)
      .set({
        status: terminal ? 'failed' : 'pending',
        availableAt: nextAvailableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: errorMessage(error),
      })
      .where(and(
        eq(eventOutbox.id, message.id),
        eq(eventOutbox.status, 'processing'),
        eq(eventOutbox.leaseOwner, this.options.workerId),
      ))
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`)
  return value
}
