import type { EventStore } from './event-store'
import type { ProjectionRegistry } from './projection-runner'
import { db } from '../db'
import { errorMessage } from '../shared/utils'
import { upsertProjectionCheckpoint } from './projection-runner'

export interface ReplayOptions {
  projectId?: string
  batchSize?: number
}

export interface ReplayResult {
  projectionName: string
  processedEvents: number
  lastGlobalPosition: number
}

export class ProjectionReplay {
  constructor(
    private readonly registry: ProjectionRegistry,
    private readonly store: EventStore,
  ) {}

  async replayProjection(name: string, options: ReplayOptions = {}): Promise<ReplayResult> {
    const definition = this.registry.get(name)
    const batchSize = options.batchSize ?? 500
    if (!Number.isInteger(batchSize) || batchSize < 1)
      throw new Error(`Replay batch size must be a positive integer: ${batchSize}`)
    if (!definition.reset)
      throw new Error(`Projection does not support replay reset: ${name}`)

    try {
      return await this.store.withTransaction(async (session) => {
        await definition.reset?.(session.transaction, options.projectId)
        await upsertProjectionCheckpoint(session.transaction, {
          projectionName: name,
          lastGlobalPosition: 0,
          status: 'running',
          lastError: null,
          updatedAt: new Date().toISOString(),
        })

        let lastGlobalPosition = 0
        let processedEvents = 0

        while (true) {
          const events = await session.readAll(lastGlobalPosition, batchSize)
          if (events.length === 0)
            break

          for (const event of events) {
            lastGlobalPosition = event.globalPosition
            if (options.projectId && event.projectId !== options.projectId)
              continue
            if (!definition.handles.includes(event.eventType))
              continue
            await definition.project(session.transaction, event)
            processedEvents += 1
          }

          if (events.length < batchSize)
            break
        }

        await upsertProjectionCheckpoint(session.transaction, {
          projectionName: name,
          lastGlobalPosition,
          status: 'idle',
          lastError: null,
          updatedAt: new Date().toISOString(),
        })
        return { projectionName: name, processedEvents, lastGlobalPosition }
      })
    }
    catch (error: unknown) {
      await db.transaction(transaction => upsertProjectionCheckpoint(transaction, {
        projectionName: name,
        lastGlobalPosition: 0,
        status: 'failed',
        lastError: errorMessage(error),
        updatedAt: new Date().toISOString(),
      }))
      throw error
    }
  }

  async replayAll(options: ReplayOptions = {}): Promise<ReplayResult[]> {
    const results: ReplayResult[] = []
    for (const definition of this.registry.list())
      results.push(await this.replayProjection(definition.name, options))
    return results
  }
}
