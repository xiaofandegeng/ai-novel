import type { EventingTransaction, EventStore } from './event-store'
import type { StoredEvent } from './event-types'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { projectionCheckpoints } from '../db/schema'
import { errorMessage } from '../shared/utils'
import { DuplicateProjectionError, UnknownProjectionError } from './errors'

export interface ProjectionDefinition {
  name: string
  mode: 'sync' | 'async'
  handles: readonly string[]
  project: (transaction: EventingTransaction, event: StoredEvent) => Promise<void>
  reset?: (transaction: EventingTransaction, projectId?: string) => Promise<void>
}

export class ProjectionRegistry {
  private readonly definitions = new Map<string, ProjectionDefinition>()

  register(definition: ProjectionDefinition): void {
    if (this.definitions.has(definition.name))
      throw new DuplicateProjectionError(definition.name)
    this.definitions.set(definition.name, definition)
  }

  get(name: string): ProjectionDefinition {
    const definition = this.definitions.get(name)
    if (!definition)
      throw new UnknownProjectionError(name)
    return definition
  }

  list(mode?: ProjectionDefinition['mode']): ProjectionDefinition[] {
    const definitions = [...this.definitions.values()]
    return mode ? definitions.filter(definition => definition.mode === mode) : definitions
  }

  async projectSync(transaction: EventingTransaction, events: StoredEvent[]): Promise<void> {
    const definitions = this.list('sync')
    const orderedEvents = [...events].sort((left, right) => left.globalPosition - right.globalPosition)
    for (const event of orderedEvents) {
      for (const definition of definitions) {
        if (definition.handles.includes(event.eventType))
          await definition.project(transaction, event)
      }
    }
  }
}

export class ProjectionRunner {
  constructor(
    private readonly registry: ProjectionRegistry,
    private readonly store: EventStore,
  ) {}

  async runBatch(projectionName: string, limit: number): Promise<number> {
    const definition = this.registry.get(projectionName)
    if (definition.mode !== 'async')
      throw new Error(`Projection is not asynchronous: ${projectionName}`)
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error(`Projection batch limit must be a positive integer: ${limit}`)

    try {
      return await this.store.withTransaction(async (session) => {
        const [checkpoint] = await session.transaction.select()
          .from(projectionCheckpoints)
          .where(eq(projectionCheckpoints.projectionName, projectionName))
          .limit(1)
        const lastPosition = checkpoint?.lastGlobalPosition ?? 0
        const events = await session.readAll(lastPosition, limit)
        const updatedAt = new Date().toISOString()

        await upsertProjectionCheckpoint(session.transaction, {
          projectionName,
          lastGlobalPosition: lastPosition,
          status: 'running',
          lastError: null,
          updatedAt,
        })

        for (const event of events) {
          if (definition.handles.includes(event.eventType))
            await definition.project(session.transaction, event)
        }

        const finalPosition = events.at(-1)?.globalPosition ?? lastPosition
        await upsertProjectionCheckpoint(session.transaction, {
          projectionName,
          lastGlobalPosition: finalPosition,
          status: 'idle',
          lastError: null,
          updatedAt: new Date().toISOString(),
        })
        return events.length
      })
    }
    catch (error: unknown) {
      await db.insert(projectionCheckpoints)
        .values({
          projectionName,
          lastGlobalPosition: 0,
          status: 'failed',
          lastError: errorMessage(error),
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: projectionCheckpoints.projectionName,
          set: {
            status: 'failed',
            lastError: errorMessage(error),
            updatedAt: new Date().toISOString(),
          },
        })
      throw error
    }
  }

  async reset(projectionName: string, projectId?: string): Promise<void> {
    const definition = this.registry.get(projectionName)
    await this.store.withTransaction(async (session) => {
      await definition.reset?.(session.transaction, projectId)
      await upsertProjectionCheckpoint(session.transaction, {
        projectionName,
        lastGlobalPosition: 0,
        status: 'idle',
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async checkpoint(projectionName: string) {
    const [checkpoint] = await db.select()
      .from(projectionCheckpoints)
      .where(eq(projectionCheckpoints.projectionName, projectionName))
      .orderBy(asc(projectionCheckpoints.projectionName))
      .limit(1)
    return checkpoint ?? null
  }
}

export async function upsertProjectionCheckpoint(
  transaction: EventingTransaction,
  checkpoint: typeof projectionCheckpoints.$inferInsert,
): Promise<void> {
  await transaction.insert(projectionCheckpoints)
    .values(checkpoint)
    .onConflictDoUpdate({
      target: projectionCheckpoints.projectionName,
      set: {
        lastGlobalPosition: checkpoint.lastGlobalPosition,
        status: checkpoint.status,
        lastError: checkpoint.lastError,
        updatedAt: checkpoint.updatedAt,
      },
    })
}
