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
import { chapterScenes, conflictParticipants, conflicts, conflictTimelineEvents } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { CHARACTER_AGGREGATE_TYPE, characterAggregate } from '../character/character.eventing'
import {
  PROJECT_AGGREGATE_TYPE,
  PROJECT_DELETED,
  projectAggregate,
} from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const CONFLICT_AGGREGATE_TYPE = 'Conflict'
export const CONFLICT_PROJECTION = 'conflicts'

export const CREATE_CONFLICT_COMMAND = 'CreateConflict'
export const CHANGE_CONFLICT_COMMAND = 'ChangeConflict'
export const DELETE_CONFLICT_COMMAND = 'DeleteConflict'
export const REPLACE_CONFLICT_PARTICIPANTS_COMMAND = 'ReplaceConflictParticipants'
export const RECORD_CONFLICT_TIMELINE_COMMAND = 'RecordConflictTimeline'
export const REMOVE_CONFLICT_TIMELINE_COMMAND = 'RemoveConflictTimeline'

export const CONFLICT_CREATED = 'ConflictCreated'
export const CONFLICT_CHANGED = 'ConflictChanged'
export const CONFLICT_DELETED = 'ConflictDeleted'
export const CONFLICT_PARTICIPANTS_REPLACED = 'ConflictParticipantsReplaced'
export const CONFLICT_TIMELINE_RECORDED = 'ConflictTimelineRecorded'
export const CONFLICT_TIMELINE_REMOVED = 'ConflictTimelineRemoved'

const SOURCE_TYPES = ['ai_extracted', 'manual'] as const
const payloadCodec = createPayloadCodec('INVALID_CONFLICT', 'Conflict payload')

export type ConflictSnapshot = JsonObject & {
  id: string
  projectId: string
  title: string
  type: string
  intensity: number
  status: string
  participants: string | null
  participantIds: string | null
  description: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
}

export type ConflictParticipantSnapshot = JsonObject & {
  id: string
  projectId: string
  conflictId: string
  characterId: string
  roleInConflict: string | null
  createdAt: string
  updatedAt: string
}

export type ConflictTimelineSnapshot = JsonObject & {
  id: string
  projectId: string
  conflictId: string
  chapterId: string | null
  sceneId: string | null
  intensityBefore: number
  intensityAfter: number
  statusBefore: string
  statusAfter: string
  reason: string | null
  evidence: string | null
  sourceType: typeof SOURCE_TYPES[number]
  createdAt: string
  updatedAt: string
}

interface ConflictState extends ConflictSnapshot {
  exists: boolean
  deleted: boolean
  participantRows: Record<string, ConflictParticipantSnapshot>
  timeline: Record<string, ConflictTimelineSnapshot>
}

export interface ConflictEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const conflictAggregate: AggregateDefinition<ConflictState> = {
  aggregateType: CONFLICT_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    exists: false,
    deleted: false,
    id: '',
    projectId: '',
    title: '',
    type: '',
    intensity: 1,
    status: 'latent',
    participants: null,
    participantIds: null,
    description: null,
    resolution: null,
    createdAt: '',
    updatedAt: '',
    participantRows: {},
    timeline: {},
  }),
  evolve: (state, event) => {
    if (event.eventType === CONFLICT_CREATED || event.eventType === CONFLICT_CHANGED) {
      return { ...state, ...readConflict(event.payload), exists: true, deleted: false }
    }
    if (event.eventType === CONFLICT_DELETED)
      return { ...state, deleted: true }
    if (event.eventType === CONFLICT_PARTICIPANTS_REPLACED) {
      const rows = readParticipants(event.payload)
      return { ...state, participantRows: Object.fromEntries(rows.map(row => [row.id, row])) }
    }
    if (event.eventType === CONFLICT_TIMELINE_RECORDED) {
      const timelineEvent = readTimeline(event.payload)
      return { ...state, timeline: { ...state.timeline, [timelineEvent.id]: timelineEvent } }
    }
    if (event.eventType === CONFLICT_TIMELINE_REMOVED) {
      const { timelineEvent } = readRemovedTimeline(event.payload)
      const timeline = { ...state.timeline }
      delete timeline[timelineEvent.id]
      return { ...state, timeline }
    }
    return state
  },
}

export function registerConflictEventing(runtime: ConflictEventingRuntime): void {
  for (const eventType of [CONFLICT_CREATED, CONFLICT_CHANGED]) {
    runtime.events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: payload => ({ conflict: readConflict(payloadCodec.object(payload)) }),
    })
  }
  runtime.events.register({
    eventType: CONFLICT_DELETED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateConflictDeleted,
  })
  runtime.events.register({
    eventType: CONFLICT_PARTICIPANTS_REPLACED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: payload => ({ participants: readParticipants(payloadCodec.object(payload)) }),
  })
  runtime.events.register({
    eventType: CONFLICT_TIMELINE_RECORDED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: payload => ({ timelineEvent: readTimeline(payloadCodec.object(payload)) }),
  })
  runtime.events.register({
    eventType: CONFLICT_TIMELINE_REMOVED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateTimelineRemoved,
  })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: ConflictEventingRuntime): void {
  runtime.commands.register(CREATE_CONFLICT_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, conflictAggregate, conflictStream(command))
    if (loaded.state.exists && !loaded.state.deleted)
      throw new DomainCommandError('CONFLICT_ALREADY_EXISTS', 'Conflict already exists')
    const participantIds = 'participantIds' in command.payload
      ? payloadCodec.stringArray(command.payload, 'participantIds')
      : []
    await assertCharacters(runtime, context.session, command.projectId!, participantIds)
    const timestamp = now()
    const conflict = createConflict(command, participantIds, timestamp)
    return decision(loaded.version, command, CONFLICT_CREATED, { conflict }, conflict, timestamp)
  })

  runtime.commands.register(CHANGE_CONFLICT_COMMAND, async (command, context) => {
    const loaded = await loadActiveConflict(runtime, command, context.session)
    const participantIds = 'participantIds' in command.payload
      ? payloadCodec.stringArray(command.payload, 'participantIds')
      : parseParticipantIds(loaded.state.participantIds)
    await assertCharacters(runtime, context.session, command.projectId!, participantIds)
    const timestamp = now()
    const conflict = changeConflict(loaded.state, command.payload, participantIds, timestamp)
    return decision(loaded.version, command, CONFLICT_CHANGED, { conflict }, conflict, timestamp)
  })

  runtime.commands.register(DELETE_CONFLICT_COMMAND, async (command, context) => {
    const loaded = await loadActiveConflict(runtime, command, context.session)
    const timestamp = now()
    const conflict = conflictResult(loaded.state)
    return decision(
      loaded.version,
      command,
      CONFLICT_DELETED,
      { conflict, deletedAt: timestamp },
      conflict,
      timestamp,
    )
  })

  runtime.commands.register(REPLACE_CONFLICT_PARTICIPANTS_COMMAND, async (command, context) => {
    const loaded = await loadActiveConflict(runtime, command, context.session)
    const timestamp = now()
    const participants = readParticipantInputs(command, timestamp)
    const characterIds = participants.map(row => row.characterId)
    if (new Set(characterIds).size !== characterIds.length)
      throw new DomainCommandError('INVALID_CONFLICT_PARTICIPANTS', 'Participants must be unique')
    await assertCharacters(runtime, context.session, command.projectId!, characterIds)
    return decision(
      loaded.version,
      command,
      CONFLICT_PARTICIPANTS_REPLACED,
      { participants },
      { participants },
      timestamp,
    )
  })

  runtime.commands.register(RECORD_CONFLICT_TIMELINE_COMMAND, async (command, context) => {
    const loaded = await loadActiveConflict(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    if (loaded.state.timeline[id])
      throw new DomainCommandError('CONFLICT_TIMELINE_ALREADY_EXISTS', 'Timeline event already exists')
    await assertTimelineReferences(runtime, context.session, command)
    const timestamp = now()
    const timelineEvent = createTimeline(command, timestamp)
    return decision(
      loaded.version,
      command,
      CONFLICT_TIMELINE_RECORDED,
      { timelineEvent },
      timelineEvent,
      timestamp,
    )
  })

  runtime.commands.register(REMOVE_CONFLICT_TIMELINE_COMMAND, async (command, context) => {
    const loaded = await loadActiveConflict(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const timelineEvent = loaded.state.timeline[id]
    if (!timelineEvent)
      throw new DomainCommandError('CONFLICT_TIMELINE_NOT_FOUND', 'Timeline event not found')
    const timestamp = now()
    return decision(
      loaded.version,
      command,
      CONFLICT_TIMELINE_REMOVED,
      { timelineEvent, removedAt: timestamp },
      timelineEvent,
      timestamp,
    )
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: CONFLICT_PROJECTION,
    mode: 'sync',
    handles: [
      CONFLICT_CREATED,
      CONFLICT_CHANGED,
      CONFLICT_DELETED,
      CONFLICT_PARTICIPANTS_REPLACED,
      CONFLICT_TIMELINE_RECORDED,
      CONFLICT_TIMELINE_REMOVED,
      PROJECT_DELETED,
    ],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await deleteProjectConflicts(transaction, event.aggregateId)
        return
      }
      if (event.eventType === CONFLICT_CREATED) {
        await transaction.insert(conflicts).values(conflictValues(readConflict(event.payload)))
        return
      }
      if (event.eventType === CONFLICT_CHANGED) {
        const conflict = readConflict(event.payload)
        await transaction.update(conflicts).set(conflictValues(conflict)).where(and(
          eq(conflicts.id, conflict.id),
          eq(conflicts.projectId, conflict.projectId),
        ))
        return
      }
      if (event.eventType === CONFLICT_DELETED) {
        const { conflict } = readConflictDeleted(event.payload)
        await transaction.delete(conflictTimelineEvents).where(eq(conflictTimelineEvents.conflictId, conflict.id))
        await transaction.delete(conflictParticipants).where(eq(conflictParticipants.conflictId, conflict.id))
        await transaction.delete(conflicts).where(and(eq(conflicts.id, conflict.id), eq(conflicts.projectId, conflict.projectId)))
        return
      }
      if (event.eventType === CONFLICT_PARTICIPANTS_REPLACED) {
        const rows = readParticipants(event.payload)
        await transaction.delete(conflictParticipants).where(and(
          eq(conflictParticipants.projectId, event.projectId!),
          eq(conflictParticipants.conflictId, event.aggregateId),
        ))
        if (rows.length)
          await transaction.insert(conflictParticipants).values(rows)
        return
      }
      if (event.eventType === CONFLICT_TIMELINE_RECORDED) {
        await transaction.insert(conflictTimelineEvents).values(timelineValues(readTimeline(event.payload)))
        return
      }
      const { timelineEvent } = readRemovedTimeline(event.payload)
      await transaction.delete(conflictTimelineEvents).where(and(
        eq(conflictTimelineEvents.id, timelineEvent.id),
        eq(conflictTimelineEvents.projectId, timelineEvent.projectId),
      ))
    },
    reset: deleteProjectConflicts,
  })
}

async function deleteProjectConflicts(
  transaction: Parameters<ProjectionRegistry['projectSync']>[0],
  projectId?: string,
): Promise<void> {
  if (projectId) {
    await transaction.delete(conflictTimelineEvents).where(eq(conflictTimelineEvents.projectId, projectId))
    await transaction.delete(conflictParticipants).where(eq(conflictParticipants.projectId, projectId))
    await transaction.delete(conflicts).where(eq(conflicts.projectId, projectId))
    return
  }
  await transaction.delete(conflictTimelineEvents)
  await transaction.delete(conflictParticipants)
  await transaction.delete(conflicts)
}

async function assertActiveProject(
  runtime: ConflictEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
): Promise<void> {
  if (command.aggregateType !== CONFLICT_AGGREGATE_TYPE || !command.projectId)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Conflict command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, {
    aggregateType: PROJECT_AGGREGATE_TYPE,
    aggregateId: command.projectId,
    projectId: command.projectId,
  })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function loadActiveConflict(
  runtime: ConflictEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(session, conflictAggregate, conflictStream(command))
  if (!loaded.state.exists || loaded.state.deleted)
    throw new DomainCommandError('CONFLICT_NOT_FOUND', 'Conflict not found')
  return loaded
}

async function assertCharacters(
  runtime: ConflictEventingRuntime,
  session: Parameters<AggregateRepository['loadInSession']>[0],
  projectId: string,
  characterIds: string[],
): Promise<void> {
  for (const characterId of new Set(characterIds)) {
    const character = await runtime.aggregates.loadInSession(session, characterAggregate, {
      aggregateType: CHARACTER_AGGREGATE_TYPE,
      aggregateId: characterId,
      projectId,
    })
    if (!character.state.exists || character.state.deleted || character.state.projectId !== projectId)
      throw new DomainCommandError('CHARACTER_NOT_FOUND', 'Character not found')
  }
}

async function assertTimelineReferences(
  runtime: ConflictEventingRuntime,
  session: Parameters<AggregateRepository['loadInSession']>[0],
  command: CommandEnvelope,
): Promise<void> {
  const projectId = command.projectId!
  const chapterId = payloadCodec.nullableString(command.payload, 'chapterId')
  if (chapterId) {
    const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, {
      aggregateType: CHAPTER_AGGREGATE_TYPE,
      aggregateId: chapterId,
      projectId,
    })
    if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
      throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
  }
  const sceneId = payloadCodec.nullableString(command.payload, 'sceneId')
  if (sceneId) {
    const [scene] = await session.transaction.select({ id: chapterScenes.id }).from(chapterScenes).where(and(
      eq(chapterScenes.id, sceneId),
      eq(chapterScenes.projectId, projectId),
    )).limit(1)
    if (!scene)
      throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
  }
}

function createConflict(command: CommandEnvelope, participantIds: string[], timestamp: string): ConflictSnapshot {
  return {
    id: command.aggregateId,
    projectId: command.projectId!,
    title: payloadCodec.string(command.payload, 'title'),
    type: payloadCodec.string(command.payload, 'type'),
    intensity: 'intensity' in command.payload ? payloadCodec.integer(command.payload, 'intensity') : 1,
    status: 'status' in command.payload ? payloadCodec.string(command.payload, 'status') : 'latent',
    participants: payloadCodec.nullableString(command.payload, 'participants'),
    participantIds: participantIds.length ? JSON.stringify(participantIds) : null,
    description: payloadCodec.nullableString(command.payload, 'description'),
    resolution: payloadCodec.nullableString(command.payload, 'resolution'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeConflict(
  current: ConflictState,
  payload: JsonObject,
  participantIds: string[],
  timestamp: string,
): ConflictSnapshot {
  return {
    ...conflictResult(current),
    title: 'title' in payload ? payloadCodec.string(payload, 'title') : current.title,
    type: 'type' in payload ? payloadCodec.string(payload, 'type') : current.type,
    intensity: 'intensity' in payload ? payloadCodec.integer(payload, 'intensity') : current.intensity,
    status: 'status' in payload ? payloadCodec.string(payload, 'status') : current.status,
    participants: payloadCodec.nextNullableString(payload, 'participants', current.participants),
    participantIds: 'participantIds' in payload
      ? (participantIds.length ? JSON.stringify(participantIds) : null)
      : current.participantIds,
    description: payloadCodec.nextNullableString(payload, 'description', current.description),
    resolution: payloadCodec.nextNullableString(payload, 'resolution', current.resolution),
    updatedAt: timestamp,
  }
}

function readParticipantInputs(command: CommandEnvelope, timestamp: string): ConflictParticipantSnapshot[] {
  return payloadCodec.objectArray(command.payload, 'participants').map(value => ({
    id: payloadCodec.string(value, 'id'),
    projectId: command.projectId!,
    conflictId: command.aggregateId,
    characterId: payloadCodec.string(value, 'characterId'),
    roleInConflict: payloadCodec.nullableString(value, 'roleInConflict'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

function createTimeline(command: CommandEnvelope, timestamp: string): ConflictTimelineSnapshot {
  return {
    id: payloadCodec.string(command.payload, 'id'),
    projectId: command.projectId!,
    conflictId: command.aggregateId,
    chapterId: payloadCodec.nullableString(command.payload, 'chapterId'),
    sceneId: payloadCodec.nullableString(command.payload, 'sceneId'),
    intensityBefore: 'intensityBefore' in command.payload ? payloadCodec.integer(command.payload, 'intensityBefore') : 0,
    intensityAfter: 'intensityAfter' in command.payload ? payloadCodec.integer(command.payload, 'intensityAfter') : 0,
    statusBefore: 'statusBefore' in command.payload ? payloadCodec.string(command.payload, 'statusBefore', { allowEmpty: true }) : '',
    statusAfter: 'statusAfter' in command.payload ? payloadCodec.string(command.payload, 'statusAfter', { allowEmpty: true }) : '',
    reason: payloadCodec.nullableString(command.payload, 'reason'),
    evidence: payloadCodec.nullableString(command.payload, 'evidence'),
    sourceType: 'sourceType' in command.payload
      ? payloadCodec.enum(command.payload, 'sourceType', SOURCE_TYPES)
      : 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function readConflict(payload: JsonObject): ConflictSnapshot {
  const value = 'conflict' in payload ? payloadCodec.object(payload.conflict) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    title: payloadCodec.string(value, 'title'),
    type: payloadCodec.string(value, 'type'),
    intensity: payloadCodec.integer(value, 'intensity'),
    status: payloadCodec.string(value, 'status'),
    participants: payloadCodec.nullableString(value, 'participants'),
    participantIds: payloadCodec.nullableString(value, 'participantIds'),
    description: payloadCodec.nullableString(value, 'description'),
    resolution: payloadCodec.nullableString(value, 'resolution'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function readParticipants(payload: JsonObject): ConflictParticipantSnapshot[] {
  return payloadCodec.objectArray(payload, 'participants').map(value => ({
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    conflictId: payloadCodec.string(value, 'conflictId'),
    characterId: payloadCodec.string(value, 'characterId'),
    roleInConflict: payloadCodec.nullableString(value, 'roleInConflict'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }))
}

function readTimeline(payload: JsonObject): ConflictTimelineSnapshot {
  const value = 'timelineEvent' in payload ? payloadCodec.object(payload.timelineEvent) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    conflictId: payloadCodec.string(value, 'conflictId'),
    chapterId: payloadCodec.nullableString(value, 'chapterId'),
    sceneId: payloadCodec.nullableString(value, 'sceneId'),
    intensityBefore: payloadCodec.integer(value, 'intensityBefore'),
    intensityAfter: payloadCodec.integer(value, 'intensityAfter'),
    statusBefore: payloadCodec.string(value, 'statusBefore', { allowEmpty: true }),
    statusAfter: payloadCodec.string(value, 'statusAfter', { allowEmpty: true }),
    reason: payloadCodec.nullableString(value, 'reason'),
    evidence: payloadCodec.nullableString(value, 'evidence'),
    sourceType: payloadCodec.enum(value, 'sourceType', SOURCE_TYPES),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function validateConflictDeleted(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return { conflict: readConflict(payloadCodec.object(value.conflict)), deletedAt: payloadCodec.string(value, 'deletedAt') }
}

function readConflictDeleted(payload: JsonObject) {
  const value = validateConflictDeleted(payload)
  return { conflict: readConflict(payloadCodec.object(value.conflict)), deletedAt: payloadCodec.string(value, 'deletedAt') }
}

function validateTimelineRemoved(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return { timelineEvent: readTimeline(payloadCodec.object(value.timelineEvent)), removedAt: payloadCodec.string(value, 'removedAt') }
}

function readRemovedTimeline(payload: JsonObject) {
  const value = validateTimelineRemoved(payload)
  return { timelineEvent: readTimeline(payloadCodec.object(value.timelineEvent)), removedAt: payloadCodec.string(value, 'removedAt') }
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
      stream: conflictStream(command),
      expectedVersion,
      events: [pendingEvent(eventType, payload, command, occurredAt)],
    }],
    result,
  }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return {
    eventId: generateId(),
    eventType,
    schemaVersion: 1,
    payload,
    metadata: { actorType: 'system', projectId: command.projectId },
    occurredAt,
  }
}

function conflictStream(command: CommandEnvelope): StreamRef {
  if (command.aggregateType !== CONFLICT_AGGREGATE_TYPE || !command.projectId)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Conflict command has invalid scope')
  return { aggregateType: CONFLICT_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}

function conflictResult(state: ConflictState): ConflictSnapshot {
  const { exists: _exists, deleted: _deleted, participantRows: _participantRows, timeline: _timeline, ...conflict } = state
  return conflict
}

function parseParticipantIds(value: string | null): string[] {
  if (!value)
    return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every(id => typeof id === 'string') ? parsed : []
  }
  catch {
    return []
  }
}

function conflictValues(conflict: ConflictSnapshot): typeof conflicts.$inferInsert {
  return {
    ...conflict,
    type: conflict.type as typeof conflicts.$inferInsert['type'],
    status: conflict.status as typeof conflicts.$inferInsert['status'],
  }
}

function timelineValues(timelineEvent: ConflictTimelineSnapshot): typeof conflictTimelineEvents.$inferInsert {
  return timelineEvent
}
