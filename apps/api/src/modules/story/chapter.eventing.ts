import type { ChapterStatus } from '@ai-novel/shared'
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
import { chapters } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import {
  PROJECT_AGGREGATE_TYPE,
  PROJECT_DELETED,
  projectAggregate,
} from '../project/project.eventing'
import {
  STORY_STRUCTURE_AGGREGATE_TYPE,
  storyStructureAggregate,
} from './story-structure.eventing'

export const CHAPTER_AGGREGATE_TYPE = 'Chapter'
export const CHAPTER_PROJECTION = 'chapters'

export const CREATE_CHAPTER_COMMAND = 'CreateChapter'
export const CHANGE_CHAPTER_COMMAND = 'ChangeChapter'
export const DELETE_CHAPTER_COMMAND = 'DeleteChapter'

export const CHAPTER_CREATED = 'ChapterCreated'
export const CHAPTER_RENAMED = 'ChapterRenamed'
export const OUTLINE_CHANGED = 'OutlineChanged'
export const CHAPTER_DETAILS_CHANGED = 'ChapterDetailsChanged'
export const CHAPTER_CONTENT_APPLIED = 'ChapterContentApplied'
export const CHAPTER_COMPLETED = 'ChapterCompleted'
export const CHAPTER_DELETED = 'ChapterDeleted'

const CHAPTER_STATUSES: readonly ChapterStatus[] = [
  'not_started',
  'planning',
  'writing',
  'completed',
]

const FULL_CHAPTER_EVENTS = [
  CHAPTER_CREATED,
  CHAPTER_RENAMED,
  OUTLINE_CHANGED,
  CHAPTER_DETAILS_CHANGED,
  CHAPTER_CONTENT_APPLIED,
  CHAPTER_COMPLETED,
] as const

export type ChapterSnapshot = JsonObject & {
  id: string
  projectId: string
  volumeId: string | null
  title: string
  chapterNumber: number
  outline: string | null
  summary: string | null
  characters: string | null
  goals: string | null
  conflicts: string | null
  events: string | null
  emotionalArc: string | null
  foreshadowing: string | null
  endingHook: string | null
  draft: string | null
  status: ChapterStatus
  createdAt: string
  updatedAt: string
}

export type ChapterState = ChapterSnapshot & {
  exists: boolean
  deleted: boolean
}

export interface ChapterEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const chapterAggregate: AggregateDefinition<ChapterState> = {
  aggregateType: CHAPTER_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    id: '',
    projectId: '',
    volumeId: null,
    title: '',
    chapterNumber: 0,
    outline: null,
    summary: null,
    characters: null,
    goals: null,
    conflicts: null,
    events: null,
    emotionalArc: null,
    foreshadowing: null,
    endingHook: null,
    draft: null,
    status: 'not_started',
    createdAt: '',
    updatedAt: '',
    exists: false,
    deleted: false,
  }),
  evolve: (state, event) => {
    if (FULL_CHAPTER_EVENTS.includes(event.eventType as typeof FULL_CHAPTER_EVENTS[number])) {
      return {
        ...readChapterEvent(event.payload),
        exists: true,
        deleted: false,
      }
    }
    if (event.eventType === CHAPTER_DELETED)
      return { ...state, deleted: true }
    return state
  },
}

export function registerChapterEventing(runtime: ChapterEventingRuntime): void {
  registerEvents(runtime.events)
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerEvents(events: EventRegistry): void {
  for (const eventType of FULL_CHAPTER_EVENTS) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: payload => ({ chapter: readChapterEvent(readObject(payload)) }),
    })
  }
  events.register({
    eventType: CHAPTER_DELETED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateDeletedEvent,
  })
}

function registerCommands(runtime: ChapterEventingRuntime): void {
  runtime.commands.register(CREATE_CHAPTER_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, chapterAggregate, stream)
    if (loaded.state.exists)
      throw new DomainCommandError('CHAPTER_ALREADY_EXISTS', 'Chapter already exists')

    const volumeId = nullableString(command.payload, 'volumeId')
    await assertVolumeExists(runtime, context.session, command.projectId!, volumeId)
    const chapterNumber = requiredInteger(command.payload, 'chapterNumber', 1)
    await assertChapterNumberAvailable(
      context.session.transaction,
      command.projectId!,
      volumeId,
      chapterNumber,
    )
    const timestamp = now()
    const chapter = createChapterSnapshot(command, timestamp)
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: [chapterEvent(CHAPTER_CREATED, chapter, command, timestamp)],
      }],
      result: chapter,
    }
  })

  runtime.commands.register(CHANGE_CHAPTER_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, chapterAggregate, stream)
    assertActiveChapter(loaded.state)

    const volumeId = 'volumeId' in command.payload
      ? nullableString(command.payload, 'volumeId')
      : loaded.state.volumeId
    const chapterNumber = 'chapterNumber' in command.payload
      ? requiredInteger(command.payload, 'chapterNumber', 1)
      : loaded.state.chapterNumber
    await assertVolumeExists(runtime, context.session, command.projectId!, volumeId)
    await assertChapterNumberAvailable(
      context.session.transaction,
      command.projectId!,
      volumeId,
      chapterNumber,
      command.aggregateId,
    )

    const timestamp = now()
    const chapter = changeChapterSnapshot(loaded.state, command.payload, timestamp)
    const eventTypes = changedEventTypes(loaded.state, chapter, command.payload)
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: eventTypes.map(eventType => chapterEvent(eventType, chapter, command, timestamp)),
      }],
      result: chapter,
    }
  })

  runtime.commands.register(DELETE_CHAPTER_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, chapterAggregate, stream)
    assertActiveChapter(loaded.state)
    const timestamp = now()
    const chapter = chapterResult(loaded.state)
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: [pendingEvent(CHAPTER_DELETED, { chapter, deletedAt: timestamp }, command, timestamp)],
      }],
      result: chapter,
    }
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: CHAPTER_PROJECTION,
    mode: 'sync',
    handles: [...FULL_CHAPTER_EVENTS, CHAPTER_DELETED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await transaction.delete(chapters).where(eq(chapters.projectId, event.aggregateId))
        return
      }
      if (event.eventType === CHAPTER_DELETED) {
        const { chapter } = readDeletedEvent(event.payload)
        await transaction.delete(chapters).where(and(
          eq(chapters.projectId, chapter.projectId),
          eq(chapters.id, chapter.id),
        ))
        return
      }
      const chapter = readChapterEvent(event.payload)
      await transaction.insert(chapters).values(chapter).onConflictDoUpdate({
        target: chapters.id,
        set: chapter,
      })
    },
    reset: async (transaction, projectId) => {
      if (projectId) {
        await transaction.delete(chapters).where(eq(chapters.projectId, projectId))
        return
      }
      await transaction.delete(chapters)
    },
  })
}

function chapterStream(command: CommandEnvelope): StreamRef {
  if (command.aggregateType !== CHAPTER_AGGREGATE_TYPE || !command.projectId) {
    throw new DomainCommandError(
      'PROJECT_SCOPE_MISMATCH',
      'Chapter commands must target a project-owned chapter stream',
    )
  }
  return {
    aggregateType: CHAPTER_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  }
}

async function assertActiveProject(
  runtime: ChapterEventingRuntime,
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

async function assertVolumeExists(
  runtime: ChapterEventingRuntime,
  session: Parameters<AggregateRepository['loadInSession']>[0],
  projectId: string,
  volumeId: string | null,
): Promise<void> {
  if (!volumeId)
    return
  const structure = await runtime.aggregates.loadInSession(session, storyStructureAggregate, {
    aggregateType: STORY_STRUCTURE_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
  })
  if (!structure.state.volumes[volumeId])
    throw new DomainCommandError('VOLUME_NOT_FOUND', '卷不属于当前项目')
}

async function assertChapterNumberAvailable(
  transaction: Parameters<ProjectionRegistry['projectSync']>[0],
  projectId: string,
  volumeId: string | null,
  chapterNumber: number,
  excludeId?: string,
): Promise<void> {
  if (!volumeId)
    return
  const conditions = [
    eq(chapters.projectId, projectId),
    eq(chapters.volumeId, volumeId),
    eq(chapters.chapterNumber, chapterNumber),
  ]
  if (excludeId)
    conditions.push(ne(chapters.id, excludeId))
  const [existing] = await transaction.select({ id: chapters.id })
    .from(chapters)
    .where(and(...conditions))
    .limit(1)
  if (existing) {
    throw new DomainCommandError(
      'CHAPTER_NUMBER_CONFLICT',
      `第 ${chapterNumber} 章已存在，请使用不同的章节序号`,
    )
  }
}

const DETAIL_FIELDS = [
  'volumeId',
  'chapterNumber',
  'summary',
  'characters',
  'goals',
  'conflicts',
  'events',
  'emotionalArc',
  'foreshadowing',
  'endingHook',
  'status',
] as const satisfies readonly (keyof ChapterSnapshot)[]

function changedEventTypes(
  current: ChapterState,
  next: ChapterSnapshot,
  input: JsonObject,
): string[] {
  const eventTypes: string[] = []
  if ('title' in input && next.title !== current.title)
    eventTypes.push(CHAPTER_RENAMED)
  if ('outline' in input && next.outline !== current.outline)
    eventTypes.push(OUTLINE_CHANGED)
  if (DETAIL_FIELDS.some(field => field in input && next[field] !== current[field]))
    eventTypes.push(CHAPTER_DETAILS_CHANGED)
  if ('draft' in input && next.draft !== current.draft)
    eventTypes.push(CHAPTER_CONTENT_APPLIED)
  if (next.status === 'completed' && current.status !== 'completed')
    eventTypes.push(CHAPTER_COMPLETED)
  if (eventTypes.length === 0)
    eventTypes.push(CHAPTER_DETAILS_CHANGED)
  return eventTypes
}

function createChapterSnapshot(command: CommandEnvelope, timestamp: string): ChapterSnapshot {
  return {
    id: command.aggregateId,
    projectId: command.projectId!,
    volumeId: nullableString(command.payload, 'volumeId'),
    title: requiredString(command.payload, 'title'),
    chapterNumber: requiredInteger(command.payload, 'chapterNumber', 1),
    outline: nullableString(command.payload, 'outline'),
    summary: nullableString(command.payload, 'summary'),
    characters: nullableString(command.payload, 'characters'),
    goals: nullableString(command.payload, 'goals'),
    conflicts: nullableString(command.payload, 'conflicts'),
    events: nullableString(command.payload, 'events'),
    emotionalArc: nullableString(command.payload, 'emotionalArc'),
    foreshadowing: nullableString(command.payload, 'foreshadowing'),
    endingHook: nullableString(command.payload, 'endingHook'),
    draft: nullableString(command.payload, 'draft'),
    status: chapterStatus(command.payload.status ?? 'not_started'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeChapterSnapshot(
  current: ChapterState,
  input: JsonObject,
  timestamp: string,
): ChapterSnapshot {
  return {
    id: current.id,
    projectId: current.projectId,
    volumeId: optionalNullableString(input, 'volumeId', current.volumeId),
    title: 'title' in input ? requiredString(input, 'title') : current.title,
    chapterNumber: 'chapterNumber' in input
      ? requiredInteger(input, 'chapterNumber', 1)
      : current.chapterNumber,
    outline: optionalNullableString(input, 'outline', current.outline),
    summary: optionalNullableString(input, 'summary', current.summary),
    characters: optionalNullableString(input, 'characters', current.characters),
    goals: optionalNullableString(input, 'goals', current.goals),
    conflicts: optionalNullableString(input, 'conflicts', current.conflicts),
    events: optionalNullableString(input, 'events', current.events),
    emotionalArc: optionalNullableString(input, 'emotionalArc', current.emotionalArc),
    foreshadowing: optionalNullableString(input, 'foreshadowing', current.foreshadowing),
    endingHook: optionalNullableString(input, 'endingHook', current.endingHook),
    draft: optionalNullableString(input, 'draft', current.draft),
    status: 'status' in input ? chapterStatus(input.status) : current.status,
    createdAt: current.createdAt,
    updatedAt: timestamp,
  }
}

function chapterEvent(
  eventType: string,
  chapter: ChapterSnapshot,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(eventType, { chapter }, command, occurredAt)
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

function readChapterEvent(payload: JsonObject): ChapterSnapshot {
  const value = 'chapter' in payload ? readObject(payload.chapter) : payload
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    volumeId: nullableString(value, 'volumeId'),
    title: requiredString(value, 'title'),
    chapterNumber: requiredInteger(value, 'chapterNumber', 1),
    outline: nullableString(value, 'outline'),
    summary: nullableString(value, 'summary'),
    characters: nullableString(value, 'characters'),
    goals: nullableString(value, 'goals'),
    conflicts: nullableString(value, 'conflicts'),
    events: nullableString(value, 'events'),
    emotionalArc: nullableString(value, 'emotionalArc'),
    foreshadowing: nullableString(value, 'foreshadowing'),
    endingHook: nullableString(value, 'endingHook'),
    draft: nullableString(value, 'draft'),
    status: chapterStatus(value.status),
    createdAt: requiredString(value, 'createdAt'),
    updatedAt: requiredString(value, 'updatedAt'),
  }
}

function validateDeletedEvent(payload: unknown): JsonObject {
  const value = readObject(payload)
  return {
    chapter: readChapterEvent(readObject(value.chapter)),
    deletedAt: requiredString(value, 'deletedAt'),
  }
}

function readDeletedEvent(payload: JsonObject): { chapter: ChapterSnapshot, deletedAt: string } {
  const value = validateDeletedEvent(payload)
  return {
    chapter: readChapterEvent(readObject(value.chapter)),
    deletedAt: requiredString(value, 'deletedAt'),
  }
}

function assertActiveChapter(state: ChapterState): void {
  if (!state.exists || state.deleted)
    throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
}

function chapterResult(state: ChapterState): ChapterSnapshot {
  return {
    id: state.id,
    projectId: state.projectId,
    volumeId: state.volumeId,
    title: state.title,
    chapterNumber: state.chapterNumber,
    outline: state.outline,
    summary: state.summary,
    characters: state.characters,
    goals: state.goals,
    conflicts: state.conflicts,
    events: state.events,
    emotionalArc: state.emotionalArc,
    foreshadowing: state.foreshadowing,
    endingHook: state.endingHook,
    draft: state.draft,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}

function requiredString(record: JsonObject, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim())
    throw new DomainCommandError('INVALID_CHAPTER', `${key} must be a non-empty string`)
  return value.trim()
}

function nullableString(record: JsonObject, key: string): string | null {
  const value = record[key]
  if (value === undefined || value === null)
    return null
  if (typeof value !== 'string')
    throw new DomainCommandError('INVALID_CHAPTER', `${key} must be a string or null`)
  return value
}

function optionalNullableString(record: JsonObject, key: string, fallback: string | null): string | null {
  return key in record ? nullableString(record, key) : fallback
}

function requiredInteger(record: JsonObject, key: string, minimum: number): number {
  const value = record[key]
  if (!Number.isInteger(value) || (value as number) < minimum)
    throw new DomainCommandError('INVALID_CHAPTER', `${key} must be an integer >= ${minimum}`)
  return value as number
}

function chapterStatus(value: unknown): ChapterStatus {
  if (!CHAPTER_STATUSES.includes(value as ChapterStatus))
    throw new DomainCommandError('INVALID_CHAPTER', `Unsupported chapter status: ${String(value)}`)
  return value as ChapterStatus
}

function readObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new DomainCommandError('INVALID_CHAPTER', 'Chapter payload must be an object')
  return value as JsonObject
}
