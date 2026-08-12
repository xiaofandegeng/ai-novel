import type { EventRegistry } from './event-registry'
import type { EventStore, EventStoreSession } from './event-store'
import type { JsonObject, StoredEvent, StreamRef } from './event-types'
import { InvalidSnapshotError } from './errors'

export interface AggregateDefinition<TState extends JsonObject> {
  aggregateType: string
  initialState: () => TState
  evolve: (state: TState, event: StoredEvent) => TState
  snapshotEvery: number
  snapshotSchemaVersion: number
}

export interface LoadedAggregate<TState extends JsonObject> {
  state: TState
  version: number
}

export class AggregateRepository {
  constructor(
    private readonly store: EventStore,
    private readonly events: EventRegistry,
  ) {}

  async load<TState extends JsonObject>(
    definition: AggregateDefinition<TState>,
    stream: StreamRef,
  ): Promise<LoadedAggregate<TState>> {
    return this.store.withTransaction(session => this.loadInSession(session, definition, stream))
  }

  async loadInSession<TState extends JsonObject>(
    session: EventStoreSession,
    definition: AggregateDefinition<TState>,
    stream: StreamRef,
  ): Promise<LoadedAggregate<TState>> {
    assertDefinition(definition, stream)

    const snapshot = await session.getSnapshot(stream)
    if (snapshot && snapshot.schemaVersion !== definition.snapshotSchemaVersion) {
      throw new InvalidSnapshotError(
        stream,
        definition.snapshotSchemaVersion,
        snapshot.schemaVersion,
      )
    }

    let state = snapshot
      ? cloneJson(snapshot.state) as TState
      : definition.initialState()
    let version = snapshot?.aggregateVersion ?? 0
    const snapshotVersion = version
    const storedEvents = await session.loadStream(stream, version)

    for (const storedEvent of storedEvents) {
      const event: StoredEvent = {
        ...storedEvent,
        payload: this.events.decode(
          storedEvent.eventType,
          storedEvent.schemaVersion,
          storedEvent.payload,
        ),
      }
      state = definition.evolve(state, event)
      version = event.aggregateVersion
    }

    if (storedEvents.length > 0 && version - snapshotVersion >= definition.snapshotEvery) {
      await session.putSnapshot({
        ...stream,
        aggregateVersion: version,
        schemaVersion: definition.snapshotSchemaVersion,
        state: cloneJson(state),
        createdAt: new Date().toISOString(),
      })
    }

    return { state, version }
  }
}

function assertDefinition<TState extends JsonObject>(
  definition: AggregateDefinition<TState>,
  stream: StreamRef,
): void {
  if (definition.aggregateType !== stream.aggregateType) {
    throw new Error(
      `Aggregate definition ${definition.aggregateType} cannot load stream ${stream.aggregateType}/${stream.aggregateId}`,
    )
  }
  if (!Number.isInteger(definition.snapshotEvery) || definition.snapshotEvery < 1)
    throw new Error(`Snapshot interval must be a positive integer: ${definition.snapshotEvery}`)
  if (!Number.isInteger(definition.snapshotSchemaVersion) || definition.snapshotSchemaVersion < 1) {
    throw new Error(
      `Snapshot schema version must be a positive integer: ${definition.snapshotSchemaVersion}`,
    )
  }
}

function cloneJson<TState extends JsonObject>(state: TState): TState {
  return structuredClone(state)
}
