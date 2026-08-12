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
import { and, eq } from 'drizzle-orm'
import { chapters, chapterScenes, characterArcEvents, characters } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import {
  PROJECT_AGGREGATE_TYPE,
  PROJECT_DELETED,
  projectAggregate,
} from '../project/project.eventing'

export const CHARACTER_AGGREGATE_TYPE = 'Character'
export const CHARACTER_PROJECTION = 'characters'

export const CREATE_CHARACTER_COMMAND = 'CreateCharacter'
export const CHANGE_CHARACTER_COMMAND = 'ChangeCharacter'
export const DELETE_CHARACTER_COMMAND = 'DeleteCharacter'
export const RECORD_CHARACTER_ARC_EVENT_COMMAND = 'RecordCharacterArcEvent'
export const CORRECT_CHARACTER_ARC_EVENT_COMMAND = 'CorrectCharacterArcEvent'
export const REMOVE_CHARACTER_ARC_EVENT_COMMAND = 'RemoveCharacterArcEvent'

export const CHARACTER_CREATED = 'CharacterCreated'
export const CHARACTER_CHANGED = 'CharacterChanged'
export const CHARACTER_DELETED = 'CharacterDeleted'
export const CHARACTER_ARC_EVENT_RECORDED = 'CharacterArcEventRecorded'
export const CHARACTER_ARC_EVENT_CORRECTED = 'CharacterArcEventCorrected'
export const CHARACTER_ARC_EVENT_REMOVED = 'CharacterArcEventRemoved'

const ARC_EVENT_TYPES = [
  'goal_shift',
  'fear_triggered',
  'secret_revealed',
  'relationship_changed',
  'belief_changed',
  'ability_changed',
  'trauma',
  'victory',
  'loss',
] as const
const ARC_SOURCE_TYPES = ['ai_extracted', 'manual'] as const
const payloadCodec = createPayloadCodec('INVALID_CHARACTER', 'Character payload')

type ArcEventType = typeof ARC_EVENT_TYPES[number]
type ArcSourceType = typeof ARC_SOURCE_TYPES[number]

export type CharacterSnapshot = JsonObject & {
  id: string
  projectId: string
  name: string
  role: string | null
  goal: string | null
  fear: string | null
  secret: string | null
  desire: string | null
  weakness: string | null
  personality: string | null
  arc: string | null
  createdAt: string
  updatedAt: string
}

export type CharacterArcSnapshot = JsonObject & {
  id: string
  projectId: string
  characterId: string
  chapterId: string | null
  sceneId: string | null
  eventType: ArcEventType
  beforeState: string | null
  afterState: string | null
  motivationChange: string | null
  relationshipImpact: string | null
  evidence: string | null
  sourceType: ArcSourceType
  createdAt: string
  updatedAt: string
}

export type CharacterState = CharacterSnapshot & {
  exists: boolean
  deleted: boolean
  arcEvents: Record<string, CharacterArcSnapshot>
}

export interface CharacterEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const characterAggregate: AggregateDefinition<CharacterState> = {
  aggregateType: CHARACTER_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    exists: false,
    deleted: false,
    id: '',
    projectId: '',
    name: '',
    role: null,
    goal: null,
    fear: null,
    secret: null,
    desire: null,
    weakness: null,
    personality: null,
    arc: null,
    createdAt: '',
    updatedAt: '',
    arcEvents: {},
  }),
  evolve: (state, event) => {
    if (event.eventType === CHARACTER_CREATED || event.eventType === CHARACTER_CHANGED) {
      const character = readCharacterEvent(event.payload)
      return { ...state, ...character, exists: true, deleted: false }
    }
    if (event.eventType === CHARACTER_DELETED)
      return { ...state, deleted: true }
    if (event.eventType === CHARACTER_ARC_EVENT_RECORDED || event.eventType === CHARACTER_ARC_EVENT_CORRECTED) {
      const arcEvent = readArcEvent(event.payload)
      return { ...state, arcEvents: { ...state.arcEvents, [arcEvent.id]: arcEvent } }
    }
    if (event.eventType === CHARACTER_ARC_EVENT_REMOVED) {
      const { arcEvent } = readRemovedArcEvent(event.payload)
      const next = { ...state.arcEvents }
      delete next[arcEvent.id]
      return { ...state, arcEvents: next }
    }
    return state
  },
}

export function registerCharacterEventing(runtime: CharacterEventingRuntime): void {
  registerEvents(runtime.events)
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerEvents(events: EventRegistry): void {
  for (const eventType of [CHARACTER_CREATED, CHARACTER_CHANGED]) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      payloadProtection: 'project-content',
      upcasters: {},
      validate: payload => ({ character: readCharacterEvent(payloadCodec.object(payload)) }),
    })
  }
  events.register({
    eventType: CHARACTER_DELETED,
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: validateCharacterDeleted,
  })
  for (const eventType of [CHARACTER_ARC_EVENT_RECORDED, CHARACTER_ARC_EVENT_CORRECTED]) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      payloadProtection: 'project-content',
      upcasters: {},
      validate: payload => ({ arcEvent: readArcEvent(payloadCodec.object(payload)) }),
    })
  }
  events.register({
    eventType: CHARACTER_ARC_EVENT_REMOVED,
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: validateRemovedArcEvent,
  })
}

function registerCommands(runtime: CharacterEventingRuntime): void {
  runtime.commands.register(CREATE_CHARACTER_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, characterAggregate, characterStream(command))
    if (loaded.state.exists && !loaded.state.deleted)
      throw new DomainCommandError('CHARACTER_ALREADY_EXISTS', 'Character already exists')
    const timestamp = now()
    const character = createCharacterSnapshot(command, timestamp)
    return decision(loaded.version, command, CHARACTER_CREATED, { character }, character, timestamp)
  })

  runtime.commands.register(CHANGE_CHARACTER_COMMAND, async (command, context) => {
    const loaded = await loadActiveCharacter(runtime, command, context.session)
    const timestamp = now()
    const character = changeCharacterSnapshot(loaded.state, command.payload, timestamp)
    return decision(loaded.version, command, CHARACTER_CHANGED, { character }, character, timestamp)
  })

  runtime.commands.register(DELETE_CHARACTER_COMMAND, async (command, context) => {
    const loaded = await loadActiveCharacter(runtime, command, context.session)
    const timestamp = now()
    const character = characterResult(loaded.state)
    return decision(
      loaded.version,
      command,
      CHARACTER_DELETED,
      { character, deletedAt: timestamp },
      character,
      timestamp,
    )
  })

  runtime.commands.register(RECORD_CHARACTER_ARC_EVENT_COMMAND, async (command, context) => {
    const loaded = await loadActiveCharacter(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    if (loaded.state.arcEvents[id])
      throw new DomainCommandError('CHARACTER_ARC_EVENT_ALREADY_EXISTS', 'Character arc event already exists')
    await assertArcReferences(context.session.transaction, command.projectId!, command.payload)
    const timestamp = now()
    const arcEvent = createArcSnapshot(command, timestamp)
    return decision(
      loaded.version,
      command,
      CHARACTER_ARC_EVENT_RECORDED,
      { arcEvent },
      arcEvent,
      timestamp,
    )
  })

  runtime.commands.register(CORRECT_CHARACTER_ARC_EVENT_COMMAND, async (command, context) => {
    const loaded = await loadActiveCharacter(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const current = loaded.state.arcEvents[id]
    if (!current)
      throw new DomainCommandError('CHARACTER_ARC_EVENT_NOT_FOUND', 'Character arc event not found')
    await assertArcReferences(context.session.transaction, command.projectId!, command.payload)
    const timestamp = now()
    const arcEvent = changeArcSnapshot(current, command.payload, timestamp)
    return decision(
      loaded.version,
      command,
      CHARACTER_ARC_EVENT_CORRECTED,
      { arcEvent },
      arcEvent,
      timestamp,
    )
  })

  runtime.commands.register(REMOVE_CHARACTER_ARC_EVENT_COMMAND, async (command, context) => {
    const loaded = await loadActiveCharacter(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const arcEvent = loaded.state.arcEvents[id]
    if (!arcEvent)
      throw new DomainCommandError('CHARACTER_ARC_EVENT_NOT_FOUND', 'Character arc event not found')
    const timestamp = now()
    return decision(
      loaded.version,
      command,
      CHARACTER_ARC_EVENT_REMOVED,
      { arcEvent, removedAt: timestamp },
      arcEvent,
      timestamp,
    )
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: CHARACTER_PROJECTION,
    mode: 'sync',
    handles: [
      CHARACTER_CREATED,
      CHARACTER_CHANGED,
      CHARACTER_DELETED,
      CHARACTER_ARC_EVENT_RECORDED,
      CHARACTER_ARC_EVENT_CORRECTED,
      CHARACTER_ARC_EVENT_REMOVED,
      PROJECT_DELETED,
    ],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await transaction.delete(characters).where(eq(characters.projectId, event.aggregateId))
        return
      }
      if (event.eventType === CHARACTER_CREATED) {
        await transaction.insert(characters).values(characterValues(readCharacterEvent(event.payload)))
        return
      }
      if (event.eventType === CHARACTER_CHANGED) {
        const character = readCharacterEvent(event.payload)
        await transaction.update(characters).set(characterValues(character)).where(and(
          eq(characters.id, character.id),
          eq(characters.projectId, character.projectId),
        ))
        return
      }
      if (event.eventType === CHARACTER_DELETED) {
        const { character } = readCharacterDeleted(event.payload)
        await transaction.delete(characters).where(and(
          eq(characters.id, character.id),
          eq(characters.projectId, character.projectId),
        ))
        return
      }
      if (event.eventType === CHARACTER_ARC_EVENT_RECORDED) {
        await transaction.insert(characterArcEvents).values(arcValues(readArcEvent(event.payload)))
        return
      }
      if (event.eventType === CHARACTER_ARC_EVENT_CORRECTED) {
        const arcEvent = readArcEvent(event.payload)
        await transaction.update(characterArcEvents).set(arcValues(arcEvent)).where(and(
          eq(characterArcEvents.id, arcEvent.id),
          eq(characterArcEvents.projectId, arcEvent.projectId),
        ))
        return
      }
      const { arcEvent } = readRemovedArcEvent(event.payload)
      await transaction.delete(characterArcEvents).where(and(
        eq(characterArcEvents.id, arcEvent.id),
        eq(characterArcEvents.projectId, arcEvent.projectId),
      ))
    },
    reset: async (transaction, projectId) => {
      if (projectId) {
        await transaction.delete(characterArcEvents).where(eq(characterArcEvents.projectId, projectId))
        await transaction.delete(characters).where(eq(characters.projectId, projectId))
        return
      }
      await transaction.delete(characterArcEvents)
      await transaction.delete(characters)
    },
  })
}

async function assertActiveProject(
  runtime: CharacterEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
): Promise<void> {
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, {
    aggregateType: PROJECT_AGGREGATE_TYPE,
    aggregateId: command.projectId!,
    projectId: command.projectId!,
  })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function loadActiveCharacter(
  runtime: CharacterEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(session, characterAggregate, characterStream(command))
  if (!loaded.state.exists || loaded.state.deleted)
    throw new DomainCommandError('CHARACTER_NOT_FOUND', 'Character not found')
  return loaded
}

async function assertArcReferences(
  transaction: Parameters<ProjectionRegistry['projectSync']>[0],
  projectId: string,
  payload: JsonObject,
): Promise<void> {
  if ('chapterId' in payload && payload.chapterId !== null) {
    const chapterId = payloadCodec.string(payload, 'chapterId')
    const [chapter] = await transaction.select({ id: chapters.id }).from(chapters).where(and(
      eq(chapters.id, chapterId),
      eq(chapters.projectId, projectId),
    )).limit(1)
    if (!chapter)
      throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
  }
  if ('sceneId' in payload && payload.sceneId !== null) {
    const sceneId = payloadCodec.string(payload, 'sceneId')
    const [scene] = await transaction.select({ id: chapterScenes.id }).from(chapterScenes).where(and(
      eq(chapterScenes.id, sceneId),
      eq(chapterScenes.projectId, projectId),
    )).limit(1)
    if (!scene)
      throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
  }
}

function createCharacterSnapshot(command: CommandEnvelope, timestamp: string): CharacterSnapshot {
  return {
    id: command.aggregateId,
    projectId: command.projectId!,
    name: payloadCodec.string(command.payload, 'name'),
    role: payloadCodec.nullableString(command.payload, 'role'),
    goal: payloadCodec.nullableString(command.payload, 'goal'),
    fear: payloadCodec.nullableString(command.payload, 'fear'),
    secret: payloadCodec.nullableString(command.payload, 'secret'),
    desire: payloadCodec.nullableString(command.payload, 'desire'),
    weakness: payloadCodec.nullableString(command.payload, 'weakness'),
    personality: payloadCodec.nullableString(command.payload, 'personality'),
    arc: payloadCodec.nullableString(command.payload, 'arc'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeCharacterSnapshot(
  current: CharacterSnapshot,
  payload: JsonObject,
  timestamp: string,
): CharacterSnapshot {
  return {
    ...current,
    name: 'name' in payload ? payloadCodec.string(payload, 'name') : current.name,
    role: payloadCodec.nextNullableString(payload, 'role', current.role),
    goal: payloadCodec.nextNullableString(payload, 'goal', current.goal),
    fear: payloadCodec.nextNullableString(payload, 'fear', current.fear),
    secret: payloadCodec.nextNullableString(payload, 'secret', current.secret),
    desire: payloadCodec.nextNullableString(payload, 'desire', current.desire),
    weakness: payloadCodec.nextNullableString(payload, 'weakness', current.weakness),
    personality: payloadCodec.nextNullableString(payload, 'personality', current.personality),
    arc: payloadCodec.nextNullableString(payload, 'arc', current.arc),
    updatedAt: timestamp,
  }
}

function createArcSnapshot(command: CommandEnvelope, timestamp: string): CharacterArcSnapshot {
  return {
    id: payloadCodec.string(command.payload, 'id'),
    projectId: command.projectId!,
    characterId: command.aggregateId,
    chapterId: payloadCodec.nullableString(command.payload, 'chapterId'),
    sceneId: payloadCodec.nullableString(command.payload, 'sceneId'),
    eventType: payloadCodec.enum(command.payload, 'eventType', ARC_EVENT_TYPES),
    beforeState: payloadCodec.nullableString(command.payload, 'beforeState'),
    afterState: payloadCodec.nullableString(command.payload, 'afterState'),
    motivationChange: payloadCodec.nullableString(command.payload, 'motivationChange'),
    relationshipImpact: payloadCodec.nullableString(command.payload, 'relationshipImpact'),
    evidence: payloadCodec.nullableString(command.payload, 'evidence'),
    sourceType: 'sourceType' in command.payload
      ? payloadCodec.enum(command.payload, 'sourceType', ARC_SOURCE_TYPES)
      : 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeArcSnapshot(
  current: CharacterArcSnapshot,
  payload: JsonObject,
  timestamp: string,
): CharacterArcSnapshot {
  return {
    ...current,
    chapterId: payloadCodec.nextNullableString(payload, 'chapterId', current.chapterId),
    sceneId: payloadCodec.nextNullableString(payload, 'sceneId', current.sceneId),
    eventType: 'eventType' in payload
      ? payloadCodec.enum(payload, 'eventType', ARC_EVENT_TYPES)
      : current.eventType,
    beforeState: payloadCodec.nextNullableString(payload, 'beforeState', current.beforeState),
    afterState: payloadCodec.nextNullableString(payload, 'afterState', current.afterState),
    motivationChange: payloadCodec.nextNullableString(payload, 'motivationChange', current.motivationChange),
    relationshipImpact: payloadCodec.nextNullableString(payload, 'relationshipImpact', current.relationshipImpact),
    evidence: payloadCodec.nextNullableString(payload, 'evidence', current.evidence),
    updatedAt: timestamp,
  }
}

function readCharacterEvent(payload: JsonObject): CharacterSnapshot {
  const value = 'character' in payload ? payloadCodec.object(payload.character) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    name: payloadCodec.string(value, 'name'),
    role: payloadCodec.nullableString(value, 'role'),
    goal: payloadCodec.nullableString(value, 'goal'),
    fear: payloadCodec.nullableString(value, 'fear'),
    secret: payloadCodec.nullableString(value, 'secret'),
    desire: payloadCodec.nullableString(value, 'desire'),
    weakness: payloadCodec.nullableString(value, 'weakness'),
    personality: payloadCodec.nullableString(value, 'personality'),
    arc: payloadCodec.nullableString(value, 'arc'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function readArcEvent(payload: JsonObject): CharacterArcSnapshot {
  const value = 'arcEvent' in payload ? payloadCodec.object(payload.arcEvent) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    characterId: payloadCodec.string(value, 'characterId'),
    chapterId: payloadCodec.nullableString(value, 'chapterId'),
    sceneId: payloadCodec.nullableString(value, 'sceneId'),
    eventType: payloadCodec.enum(value, 'eventType', ARC_EVENT_TYPES),
    beforeState: payloadCodec.nullableString(value, 'beforeState'),
    afterState: payloadCodec.nullableString(value, 'afterState'),
    motivationChange: payloadCodec.nullableString(value, 'motivationChange'),
    relationshipImpact: payloadCodec.nullableString(value, 'relationshipImpact'),
    evidence: payloadCodec.nullableString(value, 'evidence'),
    sourceType: payloadCodec.enum(value, 'sourceType', ARC_SOURCE_TYPES),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function validateCharacterDeleted(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return {
    character: readCharacterEvent(payloadCodec.object(value.character)),
    deletedAt: payloadCodec.string(value, 'deletedAt'),
  }
}

function readCharacterDeleted(payload: JsonObject): { character: CharacterSnapshot, deletedAt: string } {
  const value = validateCharacterDeleted(payload)
  return {
    character: readCharacterEvent(payloadCodec.object(value.character)),
    deletedAt: payloadCodec.string(value, 'deletedAt'),
  }
}

function validateRemovedArcEvent(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return {
    arcEvent: readArcEvent(payloadCodec.object(value.arcEvent)),
    removedAt: payloadCodec.string(value, 'removedAt'),
  }
}

function readRemovedArcEvent(payload: JsonObject): { arcEvent: CharacterArcSnapshot, removedAt: string } {
  const value = validateRemovedArcEvent(payload)
  return {
    arcEvent: readArcEvent(payloadCodec.object(value.arcEvent)),
    removedAt: payloadCodec.string(value, 'removedAt'),
  }
}

function decision<TResult extends JsonObject>(
  expectedVersion: number,
  command: CommandEnvelope,
  eventType: string,
  payload: JsonObject,
  result: TResult,
  occurredAt: string,
) {
  return {
    streams: [{
      stream: characterStream(command),
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

function characterStream(command: CommandEnvelope): StreamRef {
  return {
    aggregateType: CHARACTER_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  }
}

function characterResult(state: CharacterState): CharacterSnapshot {
  const { exists: _exists, deleted: _deleted, arcEvents: _arcEvents, ...character } = state
  return character
}

function characterValues(character: CharacterSnapshot): typeof characters.$inferInsert {
  return character
}

function arcValues(arcEvent: CharacterArcSnapshot): typeof characterArcEvents.$inferInsert {
  return arcEvent
}
