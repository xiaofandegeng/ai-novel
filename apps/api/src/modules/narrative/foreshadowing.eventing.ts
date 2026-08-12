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
import { foreshadowingCharacters, foreshadowingItems } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { CHARACTER_AGGREGATE_TYPE, characterAggregate } from '../character/character.eventing'
import { PROJECT_AGGREGATE_TYPE, PROJECT_DELETED, projectAggregate } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const FORESHADOWING_AGGREGATE_TYPE = 'Foreshadowing'
export const FORESHADOWING_PROJECTION = 'foreshadowing-ledger'

export const CREATE_FORESHADOWING_COMMAND = 'CreateForeshadowing'
export const CHANGE_FORESHADOWING_COMMAND = 'ChangeForeshadowing'
export const DELETE_FORESHADOWING_COMMAND = 'DeleteForeshadowing'
export const REPLACE_FORESHADOWING_CHARACTERS_COMMAND = 'ReplaceForeshadowingCharacters'

export const FORESHADOWING_CREATED = 'ForeshadowingCreated'
export const FORESHADOWING_CHANGED = 'ForeshadowingChanged'
export const FORESHADOWING_DELETED = 'ForeshadowingDeleted'
export const FORESHADOWING_CHARACTERS_REPLACED = 'ForeshadowingCharactersReplaced'

const STATUSES = ['open', 'progressing', 'paid_off', 'abandoned'] as const
const IMPORTANCE = ['major', 'normal', 'minor'] as const
const RELATION_TYPES = ['protagonist', 'antagonist', 'victim', 'witness', 'related'] as const
const payloadCodec = createPayloadCodec('INVALID_FORESHADOWING', 'Foreshadowing payload')

type ForeshadowingStatus = typeof STATUSES[number]
type ForeshadowingImportance = typeof IMPORTANCE[number]
type RelationType = typeof RELATION_TYPES[number]

export type ForeshadowingSnapshot = JsonObject & {
  id: string
  projectId: string
  title: string
  description: string | null
  setupChapterId: string | null
  expectedPayoffChapterId: string | null
  payoffChapterId: string | null
  status: ForeshadowingStatus
  importance: ForeshadowingImportance
  relatedCharacters: string | null
  characterIds: string | null
  relatedEvents: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ForeshadowingCharacterSnapshot = JsonObject & {
  id: string
  projectId: string
  foreshadowingId: string
  characterId: string
  relationType: RelationType
  createdAt: string
  updatedAt: string
}

interface ForeshadowingState extends ForeshadowingSnapshot {
  exists: boolean
  deleted: boolean
  characterLinks: Record<string, ForeshadowingCharacterSnapshot>
}

export interface ForeshadowingEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const foreshadowingAggregate: AggregateDefinition<ForeshadowingState> = {
  aggregateType: FORESHADOWING_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    exists: false,
    deleted: false,
    id: '',
    projectId: '',
    title: '',
    description: null,
    setupChapterId: null,
    expectedPayoffChapterId: null,
    payoffChapterId: null,
    status: 'open',
    importance: 'normal',
    relatedCharacters: null,
    characterIds: null,
    relatedEvents: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
    characterLinks: {},
  }),
  evolve: (state, event) => {
    if (event.eventType === FORESHADOWING_CREATED || event.eventType === FORESHADOWING_CHANGED)
      return { ...state, ...readForeshadowing(event.payload), exists: true, deleted: false }
    if (event.eventType === FORESHADOWING_DELETED)
      return { ...state, deleted: true }
    if (event.eventType === FORESHADOWING_CHARACTERS_REPLACED) {
      const links = readCharacterLinks(event.payload)
      return { ...state, characterLinks: Object.fromEntries(links.map(link => [link.id, link])) }
    }
    return state
  },
}

export function registerForeshadowingEventing(runtime: ForeshadowingEventingRuntime): void {
  for (const eventType of [FORESHADOWING_CREATED, FORESHADOWING_CHANGED]) {
    runtime.events.register({
      eventType,
      currentSchemaVersion: 1,
      payloadProtection: 'project-content',
      upcasters: {},
      validate: payload => ({ foreshadowing: readForeshadowing(payloadCodec.object(payload)) }),
    })
  }
  runtime.events.register({
    eventType: FORESHADOWING_DELETED,
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: validateDeleted,
  })
  runtime.events.register({
    eventType: FORESHADOWING_CHARACTERS_REPLACED,
    currentSchemaVersion: 1,
    payloadProtection: 'none',
    upcasters: {},
    validate: payload => ({ characters: readCharacterLinks(payloadCodec.object(payload)) }),
  })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: ForeshadowingEventingRuntime): void {
  runtime.commands.register(CREATE_FORESHADOWING_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, foreshadowingAggregate, stream(command))
    if (loaded.state.exists && !loaded.state.deleted)
      throw new DomainCommandError('FORESHADOWING_ALREADY_EXISTS', 'Foreshadowing already exists')
    await assertChapters(runtime, context.session, command.projectId!, command.payload)
    const characterIds = 'characterIds' in command.payload
      ? payloadCodec.stringArray(command.payload, 'characterIds')
      : []
    await assertCharacters(runtime, context.session, command.projectId!, characterIds)
    const timestamp = now()
    const foreshadowing = createSnapshot(command, characterIds, timestamp)
    return decision(loaded.version, command, FORESHADOWING_CREATED, { foreshadowing }, foreshadowing, timestamp)
  })

  runtime.commands.register(CHANGE_FORESHADOWING_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    await assertChapters(runtime, context.session, command.projectId!, command.payload)
    const characterIds = 'characterIds' in command.payload
      ? payloadCodec.stringArray(command.payload, 'characterIds')
      : parseCharacterIds(loaded.state.characterIds)
    await assertCharacters(runtime, context.session, command.projectId!, characterIds)
    const timestamp = now()
    const foreshadowing = changeSnapshot(loaded.state, command.payload, characterIds, timestamp)
    return decision(loaded.version, command, FORESHADOWING_CHANGED, { foreshadowing }, foreshadowing, timestamp)
  })

  runtime.commands.register(DELETE_FORESHADOWING_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const timestamp = now()
    const foreshadowing = result(loaded.state)
    return decision(loaded.version, command, FORESHADOWING_DELETED, { foreshadowing, deletedAt: timestamp }, foreshadowing, timestamp)
  })

  runtime.commands.register(REPLACE_FORESHADOWING_CHARACTERS_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const timestamp = now()
    const characters = readLinkInputs(command, timestamp)
    const characterIds = characters.map(link => link.characterId)
    if (new Set(characterIds).size !== characterIds.length)
      throw new DomainCommandError('INVALID_FORESHADOWING_CHARACTERS', 'Characters must be unique')
    await assertCharacters(runtime, context.session, command.projectId!, characterIds)
    return decision(
      loaded.version,
      command,
      FORESHADOWING_CHARACTERS_REPLACED,
      { characters },
      { characters },
      timestamp,
    )
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: FORESHADOWING_PROJECTION,
    mode: 'sync',
    handles: [FORESHADOWING_CREATED, FORESHADOWING_CHANGED, FORESHADOWING_DELETED, FORESHADOWING_CHARACTERS_REPLACED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await deleteProjectRows(transaction, event.aggregateId)
        return
      }
      if (event.eventType === FORESHADOWING_CREATED) {
        await transaction.insert(foreshadowingItems).values(values(readForeshadowing(event.payload)))
        return
      }
      if (event.eventType === FORESHADOWING_CHANGED) {
        const foreshadowing = readForeshadowing(event.payload)
        await transaction.update(foreshadowingItems).set(values(foreshadowing)).where(and(
          eq(foreshadowingItems.id, foreshadowing.id),
          eq(foreshadowingItems.projectId, foreshadowing.projectId),
        ))
        return
      }
      if (event.eventType === FORESHADOWING_DELETED) {
        const { foreshadowing } = readDeleted(event.payload)
        await transaction.delete(foreshadowingCharacters).where(eq(foreshadowingCharacters.foreshadowingId, foreshadowing.id))
        await transaction.delete(foreshadowingItems).where(and(eq(foreshadowingItems.id, foreshadowing.id), eq(foreshadowingItems.projectId, foreshadowing.projectId)))
        return
      }
      const links = readCharacterLinks(event.payload)
      await transaction.delete(foreshadowingCharacters).where(and(
        eq(foreshadowingCharacters.projectId, event.projectId!),
        eq(foreshadowingCharacters.foreshadowingId, event.aggregateId),
      ))
      if (links.length)
        await transaction.insert(foreshadowingCharacters).values(links)
    },
    reset: deleteProjectRows,
  })
}

async function deleteProjectRows(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  if (projectId) {
    await transaction.delete(foreshadowingCharacters).where(eq(foreshadowingCharacters.projectId, projectId))
    await transaction.delete(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
    return
  }
  await transaction.delete(foreshadowingCharacters)
  await transaction.delete(foreshadowingItems)
}

async function assertActiveProject(runtime: ForeshadowingEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  if (command.aggregateType !== FORESHADOWING_AGGREGATE_TYPE || !command.projectId)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Foreshadowing command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, { aggregateType: PROJECT_AGGREGATE_TYPE, aggregateId: command.projectId, projectId: command.projectId })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function loadActive(runtime: ForeshadowingEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(session, foreshadowingAggregate, stream(command))
  if (!loaded.state.exists || loaded.state.deleted)
    throw new DomainCommandError('FORESHADOWING_NOT_FOUND', 'Foreshadowing not found')
  return loaded
}

async function assertChapters(runtime: ForeshadowingEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, payload: JsonObject) {
  for (const key of ['setupChapterId', 'expectedPayoffChapterId', 'payoffChapterId']) {
    if (!(key in payload) || payload[key] === null)
      continue
    const chapterId = payloadCodec.string(payload, key)
    const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, { aggregateType: CHAPTER_AGGREGATE_TYPE, aggregateId: chapterId, projectId })
    if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
      throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
  }
}

async function assertCharacters(runtime: ForeshadowingEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, ids: string[]) {
  for (const characterId of new Set(ids)) {
    const character = await runtime.aggregates.loadInSession(session, characterAggregate, { aggregateType: CHARACTER_AGGREGATE_TYPE, aggregateId: characterId, projectId })
    if (!character.state.exists || character.state.deleted || character.state.projectId !== projectId)
      throw new DomainCommandError('CHARACTER_NOT_FOUND', 'Character not found')
  }
}

function createSnapshot(command: CommandEnvelope, characterIds: string[], timestamp: string): ForeshadowingSnapshot {
  return {
    id: command.aggregateId,
    projectId: command.projectId!,
    title: payloadCodec.string(command.payload, 'title'),
    description: payloadCodec.nullableString(command.payload, 'description'),
    setupChapterId: payloadCodec.nullableString(command.payload, 'setupChapterId'),
    expectedPayoffChapterId: payloadCodec.nullableString(command.payload, 'expectedPayoffChapterId'),
    payoffChapterId: payloadCodec.nullableString(command.payload, 'payoffChapterId'),
    status: 'status' in command.payload ? payloadCodec.enum(command.payload, 'status', STATUSES) : 'open',
    importance: 'importance' in command.payload ? payloadCodec.enum(command.payload, 'importance', IMPORTANCE) : 'normal',
    relatedCharacters: payloadCodec.nullableString(command.payload, 'relatedCharacters'),
    characterIds: characterIds.length ? JSON.stringify(characterIds) : null,
    relatedEvents: payloadCodec.nullableString(command.payload, 'relatedEvents'),
    notes: payloadCodec.nullableString(command.payload, 'notes'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeSnapshot(current: ForeshadowingState, payload: JsonObject, characterIds: string[], timestamp: string): ForeshadowingSnapshot {
  return {
    ...result(current),
    title: 'title' in payload ? payloadCodec.string(payload, 'title') : current.title,
    description: payloadCodec.nextNullableString(payload, 'description', current.description),
    setupChapterId: payloadCodec.nextNullableString(payload, 'setupChapterId', current.setupChapterId),
    expectedPayoffChapterId: payloadCodec.nextNullableString(payload, 'expectedPayoffChapterId', current.expectedPayoffChapterId),
    payoffChapterId: payloadCodec.nextNullableString(payload, 'payoffChapterId', current.payoffChapterId),
    status: 'status' in payload ? payloadCodec.enum(payload, 'status', STATUSES) : current.status,
    importance: 'importance' in payload ? payloadCodec.enum(payload, 'importance', IMPORTANCE) : current.importance,
    relatedCharacters: payloadCodec.nextNullableString(payload, 'relatedCharacters', current.relatedCharacters),
    characterIds: 'characterIds' in payload ? (characterIds.length ? JSON.stringify(characterIds) : null) : current.characterIds,
    relatedEvents: payloadCodec.nextNullableString(payload, 'relatedEvents', current.relatedEvents),
    notes: payloadCodec.nextNullableString(payload, 'notes', current.notes),
    updatedAt: timestamp,
  }
}

function readLinkInputs(command: CommandEnvelope, timestamp: string): ForeshadowingCharacterSnapshot[] {
  return payloadCodec.objectArray(command.payload, 'characters').map(value => ({
    id: payloadCodec.string(value, 'id'),
    projectId: command.projectId!,
    foreshadowingId: command.aggregateId,
    characterId: payloadCodec.string(value, 'characterId'),
    relationType: payloadCodec.enum(value, 'relationType', RELATION_TYPES),
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

function readForeshadowing(payload: JsonObject): ForeshadowingSnapshot {
  const value = 'foreshadowing' in payload ? payloadCodec.object(payload.foreshadowing) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    title: payloadCodec.string(value, 'title'),
    description: payloadCodec.nullableString(value, 'description'),
    setupChapterId: payloadCodec.nullableString(value, 'setupChapterId'),
    expectedPayoffChapterId: payloadCodec.nullableString(value, 'expectedPayoffChapterId'),
    payoffChapterId: payloadCodec.nullableString(value, 'payoffChapterId'),
    status: payloadCodec.enum(value, 'status', STATUSES),
    importance: payloadCodec.enum(value, 'importance', IMPORTANCE),
    relatedCharacters: payloadCodec.nullableString(value, 'relatedCharacters'),
    characterIds: payloadCodec.nullableString(value, 'characterIds'),
    relatedEvents: payloadCodec.nullableString(value, 'relatedEvents'),
    notes: payloadCodec.nullableString(value, 'notes'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function readCharacterLinks(payload: JsonObject): ForeshadowingCharacterSnapshot[] {
  return payloadCodec.objectArray(payload, 'characters').map(value => ({
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    foreshadowingId: payloadCodec.string(value, 'foreshadowingId'),
    characterId: payloadCodec.string(value, 'characterId'),
    relationType: payloadCodec.enum(value, 'relationType', RELATION_TYPES),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }))
}

function validateDeleted(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return { foreshadowing: readForeshadowing(payloadCodec.object(value.foreshadowing)), deletedAt: payloadCodec.string(value, 'deletedAt') }
}

function readDeleted(payload: JsonObject) {
  const value = validateDeleted(payload)
  return { foreshadowing: readForeshadowing(payloadCodec.object(value.foreshadowing)), deletedAt: payloadCodec.string(value, 'deletedAt') }
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, eventType: string, payload: JsonObject, resultValue: TResult, occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events: [pendingEvent(eventType, payload, command, occurredAt)] }], result: resultValue }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  if (command.aggregateType !== FORESHADOWING_AGGREGATE_TYPE || !command.projectId)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Foreshadowing command has invalid scope')
  return { aggregateType: FORESHADOWING_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}

function result(state: ForeshadowingState): ForeshadowingSnapshot {
  const { exists: _exists, deleted: _deleted, characterLinks: _links, ...foreshadowing } = state
  return foreshadowing
}

function parseCharacterIds(value: string | null): string[] {
  if (!value)
    return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every(id => typeof id === 'string') ? parsed : []
  }
  catch { return [] }
}

function values(foreshadowing: ForeshadowingSnapshot): typeof foreshadowingItems.$inferInsert {
  return foreshadowing
}
