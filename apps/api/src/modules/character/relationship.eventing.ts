import type {
  AggregateDefinition,
  AggregateRepository,
  CommandBus,
  CommandEnvelope,
  EventRegistry,
  JsonObject,
  PendingEvent,
  ProjectionRegistry,
  StreamRef,
} from '../../eventing'
import { and, eq, ne } from 'drizzle-orm'
import { characterRelationships } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import {
  PROJECT_AGGREGATE_TYPE,
  PROJECT_DELETED,
  projectAggregate,
} from '../project/project.eventing'
import { normalizeCharacterPair } from './character-utils.service'
import { CHARACTER_AGGREGATE_TYPE, characterAggregate } from './character.eventing'

export const RELATIONSHIP_AGGREGATE_TYPE = 'Relationship'
export const RELATIONSHIP_PROJECTION = 'character-relationships'

export const CREATE_RELATIONSHIP_COMMAND = 'CreateRelationship'
export const CHANGE_RELATIONSHIP_COMMAND = 'ChangeRelationship'
export const DELETE_RELATIONSHIP_COMMAND = 'DeleteRelationship'

export const RELATIONSHIP_CREATED = 'RelationshipCreated'
export const RELATIONSHIP_CHANGED = 'RelationshipChanged'
export const RELATIONSHIP_DELETED = 'RelationshipDeleted'

const payloadCodec = createPayloadCodec('INVALID_RELATIONSHIP', 'Relationship payload')

export type RelationshipSnapshot = JsonObject & {
  id: string
  projectId: string
  characterAId: string
  characterBId: string
  type: string
  strength: number
  status: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

interface RelationshipState extends RelationshipSnapshot {
  exists: boolean
  deleted: boolean
}

export interface RelationshipEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const relationshipAggregate: AggregateDefinition<RelationshipState> = {
  aggregateType: RELATIONSHIP_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    exists: false,
    deleted: false,
    id: '',
    projectId: '',
    characterAId: '',
    characterBId: '',
    type: '',
    strength: 1,
    status: null,
    description: null,
    createdAt: '',
    updatedAt: '',
  }),
  evolve: (state, event) => {
    if (event.eventType === RELATIONSHIP_CREATED || event.eventType === RELATIONSHIP_CHANGED) {
      return {
        ...state,
        ...readRelationshipEvent(event.payload),
        exists: true,
        deleted: false,
      }
    }
    if (event.eventType === RELATIONSHIP_DELETED)
      return { ...state, deleted: true }
    return state
  },
}

export function registerRelationshipEventing(runtime: RelationshipEventingRuntime): void {
  for (const eventType of [RELATIONSHIP_CREATED, RELATIONSHIP_CHANGED]) {
    runtime.events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: payload => ({ relationship: readRelationshipEvent(payloadCodec.object(payload)) }),
    })
  }
  runtime.events.register({
    eventType: RELATIONSHIP_DELETED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateRelationshipDeleted,
  })

  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: RelationshipEventingRuntime): void {
  runtime.commands.register(CREATE_RELATIONSHIP_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(
      context.session,
      relationshipAggregate,
      relationshipStream(command),
    )
    if (loaded.state.exists && !loaded.state.deleted)
      throw new DomainCommandError('RELATIONSHIP_ALREADY_EXISTS', 'Relationship already exists')

    const [characterAId, characterBId] = readPair(command.payload)
    await assertCharacters(runtime, context.session, command.projectId!, characterAId, characterBId)
    await assertUniquePair(
      context.session.transaction,
      command.projectId!,
      characterAId,
      characterBId,
    )
    const timestamp = now()
    const relationship = createRelationshipSnapshot(
      command,
      characterAId,
      characterBId,
      timestamp,
    )
    return decision(loaded.version, command, RELATIONSHIP_CREATED, { relationship }, relationship, timestamp)
  })

  runtime.commands.register(CHANGE_RELATIONSHIP_COMMAND, async (command, context) => {
    const loaded = await loadActiveRelationship(runtime, command, context.session)
    const nextAId = 'characterAId' in command.payload
      ? payloadCodec.string(command.payload, 'characterAId')
      : loaded.state.characterAId
    const nextBId = 'characterBId' in command.payload
      ? payloadCodec.string(command.payload, 'characterBId')
      : loaded.state.characterBId
    const [characterAId, characterBId] = normalizePair(nextAId, nextBId)
    await assertCharacters(runtime, context.session, command.projectId!, characterAId, characterBId)
    await assertUniquePair(
      context.session.transaction,
      command.projectId!,
      characterAId,
      characterBId,
      command.aggregateId,
    )
    const timestamp = now()
    const relationship = changeRelationshipSnapshot(
      loaded.state,
      command.payload,
      characterAId,
      characterBId,
      timestamp,
    )
    return decision(loaded.version, command, RELATIONSHIP_CHANGED, { relationship }, relationship, timestamp)
  })

  runtime.commands.register(DELETE_RELATIONSHIP_COMMAND, async (command, context) => {
    const loaded = await loadActiveRelationship(runtime, command, context.session)
    const timestamp = now()
    const relationship = relationshipResult(loaded.state)
    return decision(
      loaded.version,
      command,
      RELATIONSHIP_DELETED,
      { relationship, deletedAt: timestamp },
      relationship,
      timestamp,
    )
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: RELATIONSHIP_PROJECTION,
    mode: 'sync',
    handles: [RELATIONSHIP_CREATED, RELATIONSHIP_CHANGED, RELATIONSHIP_DELETED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await transaction.delete(characterRelationships).where(
          eq(characterRelationships.projectId, event.aggregateId),
        )
        return
      }
      if (event.eventType === RELATIONSHIP_CREATED) {
        await transaction.insert(characterRelationships).values(
          relationshipValues(readRelationshipEvent(event.payload)),
        )
        return
      }
      if (event.eventType === RELATIONSHIP_CHANGED) {
        const relationship = readRelationshipEvent(event.payload)
        await transaction.update(characterRelationships).set(relationshipValues(relationship)).where(and(
          eq(characterRelationships.id, relationship.id),
          eq(characterRelationships.projectId, relationship.projectId),
        ))
        return
      }
      const { relationship } = readRelationshipDeleted(event.payload)
      await transaction.delete(characterRelationships).where(and(
        eq(characterRelationships.id, relationship.id),
        eq(characterRelationships.projectId, relationship.projectId),
      ))
    },
    reset: async (transaction, projectId) => {
      if (projectId) {
        await transaction.delete(characterRelationships).where(eq(characterRelationships.projectId, projectId))
        return
      }
      await transaction.delete(characterRelationships)
    },
  })
}

async function assertActiveProject(
  runtime: RelationshipEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
): Promise<void> {
  const projectId = command.projectId
  if (command.aggregateType !== RELATIONSHIP_AGGREGATE_TYPE || !projectId)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Relationship command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, {
    aggregateType: PROJECT_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
  })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function loadActiveRelationship(
  runtime: RelationshipEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(
    session,
    relationshipAggregate,
    relationshipStream(command),
  )
  if (!loaded.state.exists || loaded.state.deleted)
    throw new DomainCommandError('RELATIONSHIP_NOT_FOUND', 'Relationship not found')
  return loaded
}

async function assertCharacters(
  runtime: RelationshipEventingRuntime,
  session: Parameters<AggregateRepository['loadInSession']>[0],
  projectId: string,
  characterAId: string,
  characterBId: string,
): Promise<void> {
  for (const characterId of [characterAId, characterBId]) {
    const character = await runtime.aggregates.loadInSession(session, characterAggregate, {
      aggregateType: CHARACTER_AGGREGATE_TYPE,
      aggregateId: characterId,
      projectId,
    })
    if (!character.state.exists || character.state.deleted || character.state.projectId !== projectId)
      throw new DomainCommandError('CHARACTER_NOT_FOUND', 'Character not found')
  }
}

async function assertUniquePair(
  transaction: Parameters<ProjectionRegistry['projectSync']>[0],
  projectId: string,
  characterAId: string,
  characterBId: string,
  excludingId?: string,
): Promise<void> {
  const conditions = [
    eq(characterRelationships.projectId, projectId),
    eq(characterRelationships.characterAId, characterAId),
    eq(characterRelationships.characterBId, characterBId),
  ]
  if (excludingId)
    conditions.push(ne(characterRelationships.id, excludingId))
  const [existing] = await transaction.select({ id: characterRelationships.id })
    .from(characterRelationships)
    .where(and(...conditions))
    .limit(1)
  if (existing)
    throw new DomainCommandError('RELATIONSHIP_ALREADY_EXISTS', 'Relationship already exists')
}

function readPair(payload: JsonObject): [string, string] {
  return normalizePair(
    payloadCodec.string(payload, 'characterAId'),
    payloadCodec.string(payload, 'characterBId'),
  )
}

function normalizePair(characterAId: string, characterBId: string): [string, string] {
  if (characterAId === characterBId)
    throw new DomainCommandError('INVALID_RELATIONSHIP_CHARACTERS', 'Relationship characters must differ')
  return normalizeCharacterPair(characterAId, characterBId)
}

function createRelationshipSnapshot(
  command: CommandEnvelope,
  characterAId: string,
  characterBId: string,
  timestamp: string,
): RelationshipSnapshot {
  return {
    id: command.aggregateId,
    projectId: command.projectId!,
    characterAId,
    characterBId,
    type: payloadCodec.string(command.payload, 'type'),
    strength: 'strength' in command.payload ? payloadCodec.integer(command.payload, 'strength') : 1,
    status: payloadCodec.nullableString(command.payload, 'status'),
    description: payloadCodec.nullableString(command.payload, 'description'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeRelationshipSnapshot(
  current: RelationshipState,
  payload: JsonObject,
  characterAId: string,
  characterBId: string,
  timestamp: string,
): RelationshipSnapshot {
  return {
    ...relationshipResult(current),
    characterAId,
    characterBId,
    type: 'type' in payload ? payloadCodec.string(payload, 'type') : current.type,
    strength: 'strength' in payload ? payloadCodec.integer(payload, 'strength') : current.strength,
    status: payloadCodec.nextNullableString(payload, 'status', current.status),
    description: payloadCodec.nextNullableString(payload, 'description', current.description),
    updatedAt: timestamp,
  }
}

function readRelationshipEvent(payload: JsonObject): RelationshipSnapshot {
  const value = 'relationship' in payload ? payloadCodec.object(payload.relationship) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    characterAId: payloadCodec.string(value, 'characterAId'),
    characterBId: payloadCodec.string(value, 'characterBId'),
    type: payloadCodec.string(value, 'type'),
    strength: payloadCodec.integer(value, 'strength'),
    status: payloadCodec.nullableString(value, 'status'),
    description: payloadCodec.nullableString(value, 'description'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function validateRelationshipDeleted(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return {
    relationship: readRelationshipEvent(payloadCodec.object(value.relationship)),
    deletedAt: payloadCodec.string(value, 'deletedAt'),
  }
}

function readRelationshipDeleted(payload: JsonObject) {
  const value = validateRelationshipDeleted(payload)
  return {
    relationship: readRelationshipEvent(payloadCodec.object(value.relationship)),
    deletedAt: payloadCodec.string(value, 'deletedAt'),
  }
}

function decision(
  expectedVersion: number,
  command: CommandEnvelope,
  eventType: string,
  payload: JsonObject,
  result: RelationshipSnapshot,
  occurredAt: string,
) {
  return {
    streams: [{
      stream: relationshipStream(command),
      expectedVersion,
      events: [pendingEvent(eventType, payload, command, occurredAt)],
    }],
    result,
  }
}

function pendingEvent(
  eventType: string,
  payload: JsonObject,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return {
    eventId: generateId(),
    eventType,
    schemaVersion: 1,
    payload,
    metadata: { actorType: 'system', projectId: command.projectId },
    occurredAt,
  }
}

function relationshipStream(command: CommandEnvelope): StreamRef {
  if (command.aggregateType !== RELATIONSHIP_AGGREGATE_TYPE || !command.projectId)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Relationship command has invalid scope')
  return {
    aggregateType: RELATIONSHIP_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  }
}

function relationshipResult(state: RelationshipState): RelationshipSnapshot {
  const { exists: _exists, deleted: _deleted, ...relationship } = state
  return relationship
}

function relationshipValues(relationship: RelationshipSnapshot): typeof characterRelationships.$inferInsert {
  return relationship
}
