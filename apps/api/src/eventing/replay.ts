import type { EventStore, EventStoreSession, ReplayBoundary } from './event-store'
import type { ProjectionDefinition, ProjectionRegistry } from './projection-runner'
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
    validateReplayDefinition(definition, batchSize)

    try {
      return await this.store.withTransaction(async (session) => {
        const boundary = await session.prepareReplay()
        return this.replayProjectionInSession(
          session,
          definition,
          options,
          batchSize,
          boundary,
        )
      })
    }
    catch (error: unknown) {
      await recordReplayFailure(name, error)
      throw error
    }
  }

  async replayAll(options: ReplayOptions = {}): Promise<ReplayResult[]> {
    const definitions = this.registry.list()
    const batchSize = options.batchSize ?? 500
    for (const definition of definitions)
      validateReplayDefinition(definition, batchSize)
    if (definitions.length === 0)
      return []

    let currentProjectionName = definitions[0]!.name
    try {
      return await this.store.withTransaction(async (session) => {
        const boundary = await session.prepareReplay()
        const results: ReplayResult[] = []
        for (const definition of definitions) {
          currentProjectionName = definition.name
          results.push(await this.replayProjectionInSession(
            session,
            definition,
            options,
            batchSize,
            boundary,
          ))
        }
        return results
      })
    }
    catch (error: unknown) {
      await recordReplayFailure(currentProjectionName, error)
      throw error
    }
  }

  private async replayProjectionInSession(
    session: EventStoreSession,
    definition: ProjectionDefinition,
    options: ReplayOptions,
    batchSize: number,
    boundary: ReplayBoundary,
  ): Promise<ReplayResult> {
    await definition.reset!(session.transaction, options.projectId)
    await upsertProjectionCheckpoint(session.transaction, {
      projectionName: definition.name,
      lastGlobalPosition: 0,
      status: 'running',
      lastError: null,
      updatedAt: new Date().toISOString(),
    })

    let lastGlobalPosition = 0
    let processedEvents = 0

    while (true) {
      const batch = await session.readAllForReplay(
        lastGlobalPosition,
        batchSize,
        boundary,
        options.projectId,
      )
      lastGlobalPosition = batch.lastGlobalPosition

      for (const event of batch.events) {
        const normalized = this.registry.normalizeEvent(event)
        if (!definition.handles.includes(normalized.eventType))
          continue
        await definition.project(session.transaction, normalized)
        processedEvents += 1
      }

      if (batch.reachedEnd)
        break
    }

    await upsertProjectionCheckpoint(session.transaction, {
      projectionName: definition.name,
      lastGlobalPosition,
      status: 'idle',
      lastError: null,
      updatedAt: new Date().toISOString(),
    })
    return {
      projectionName: definition.name,
      processedEvents,
      lastGlobalPosition,
    }
  }
}

function validateReplayDefinition(definition: ProjectionDefinition, batchSize: number): void {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new Error(`Replay batch size must be a positive integer: ${batchSize}`)
  if (!definition.reset)
    throw new Error(`Projection does not support replay reset: ${definition.name}`)
}

async function recordReplayFailure(name: string, error: unknown): Promise<void> {
  await db.transaction(transaction => upsertProjectionCheckpoint(transaction, {
    projectionName: name,
    lastGlobalPosition: 0,
    status: 'failed',
    lastError: errorMessage(error),
    updatedAt: new Date().toISOString(),
  }))
}
