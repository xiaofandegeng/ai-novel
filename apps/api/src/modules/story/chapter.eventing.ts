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
import { chapters, chapterScenes, chapterVersions } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
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
export const APPLY_CHAPTER_CONTENT_COMMAND = 'ApplyChapterContent'
export const RECORD_CHAPTER_VERSION_COMMAND = 'RecordChapterVersion'
export const PLAN_SCENES_COMMAND = 'PlanScenes'
export const CHANGE_SCENE_COMMAND = 'ChangeScene'
export const REORDER_SCENES_COMMAND = 'ReorderScenes'
export const DELETE_SCENE_COMMAND = 'DeleteScene'

export const CHAPTER_CREATED = 'ChapterCreated'
export const CHAPTER_RENAMED = 'ChapterRenamed'
export const OUTLINE_CHANGED = 'OutlineChanged'
export const CHAPTER_DETAILS_CHANGED = 'ChapterDetailsChanged'
export const CHAPTER_CONTENT_APPLIED = 'ChapterContentApplied'
export const CHAPTER_COMPLETED = 'ChapterCompleted'
export const CHAPTER_DELETED = 'ChapterDeleted'
export const CHAPTER_VERSION_RECORDED = 'ChapterVersionRecorded'
export const SCENE_PLANNED = 'ScenePlanned'
export const SCENE_CHANGED = 'SceneChanged'
export const SCENE_REORDERED = 'SceneReordered'
export const SCENE_CONTENT_APPLIED = 'SceneContentApplied'
export const SCENE_DELETED = 'SceneDeleted'

const payloadCodec = createPayloadCodec('INVALID_CHAPTER', 'Chapter payload')

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

const FULL_SCENE_EVENTS = [
  SCENE_PLANNED,
  SCENE_CHANGED,
  SCENE_REORDERED,
  SCENE_CONTENT_APPLIED,
] as const

type SceneStatus = 'planned' | 'drafting' | 'reviewed' | 'completed'
type SceneBeatType = 'hook' | 'setup' | 'reveal' | 'conflict' | 'reversal' | 'payoff' | 'transition' | 'cliffhanger'

const SCENE_STATUSES: readonly SceneStatus[] = ['planned', 'drafting', 'reviewed', 'completed']
const SCENE_BEAT_TYPES: readonly SceneBeatType[] = [
  'hook',
  'setup',
  'reveal',
  'conflict',
  'reversal',
  'payoff',
  'transition',
  'cliffhanger',
]

export type SceneSnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  sceneNumber: number
  title: string | null
  location: string | null
  timeline: string | null
  purpose: string | null
  summary: string | null
  characters: string | null
  targetWords: number | null
  content: string | null
  orderIndex: number
  status: SceneStatus
  conflict: string | null
  beatType: SceneBeatType | null
  entryHook: string | null
  turningPoint: string | null
  exitHook: string | null
  emotionStart: string | null
  emotionEnd: string | null
  conflictLevel: number | null
  requiredElements: string | null
  createdAt: string
  updatedAt: string
}

const SCENE_DETAIL_FIELDS = [
  'sceneNumber',
  'title',
  'location',
  'timeline',
  'purpose',
  'summary',
  'characters',
  'targetWords',
  'orderIndex',
  'status',
  'conflict',
  'beatType',
  'entryHook',
  'turningPoint',
  'exitHook',
  'emotionStart',
  'emotionEnd',
  'conflictLevel',
  'requiredElements',
] as const satisfies readonly (keyof SceneSnapshot)[]

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

export type ChapterVersionSnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  content: string
  wordCount: number
  note: string | null
  createdAt: string
}

export type ChapterState = ChapterSnapshot & {
  exists: boolean
  deleted: boolean
  scenes: Record<string, SceneSnapshot>
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
    scenes: {},
  }),
  evolve: (state, event) => {
    if (FULL_CHAPTER_EVENTS.includes(event.eventType as typeof FULL_CHAPTER_EVENTS[number])) {
      return {
        ...readChapterEvent(event.payload),
        exists: true,
        deleted: false,
        scenes: state.scenes ?? {},
      }
    }
    if (FULL_SCENE_EVENTS.includes(event.eventType as typeof FULL_SCENE_EVENTS[number])) {
      const scene = readSceneEvent(event.payload)
      return {
        ...state,
        scenes: { ...(state.scenes ?? {}), [scene.id]: scene },
      }
    }
    if (event.eventType === SCENE_DELETED) {
      const { scene } = readDeletedSceneEvent(event.payload)
      const nextScenes = { ...(state.scenes ?? {}) }
      delete nextScenes[scene.id]
      return { ...state, scenes: nextScenes }
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
      validate: eventType === CHAPTER_CONTENT_APPLIED
        ? validateContentAppliedEvent
        : payload => ({ chapter: readChapterEvent(readObject(payload)) }),
    })
  }
  events.register({
    eventType: CHAPTER_DELETED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateDeletedEvent,
  })
  events.register({
    eventType: CHAPTER_VERSION_RECORDED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateVersionRecordedEvent,
  })
  for (const eventType of FULL_SCENE_EVENTS) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: payload => ({ scene: readSceneEvent(readObject(payload)) }),
    })
  }
  events.register({
    eventType: SCENE_DELETED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateDeletedSceneEvent,
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
        events: eventTypes.map(eventType => (
          eventType === CHAPTER_CONTENT_APPLIED
            ? contentAppliedEvent(chapter, command, timestamp)
            : chapterEvent(eventType, chapter, command, timestamp)
        )),
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

  runtime.commands.register(APPLY_CHAPTER_CONTENT_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const timestamp = now()
    const chapter = changeChapterSnapshot(loaded.state, {
      draft: nonEmptyString(command.payload, 'content'),
    }, timestamp)
    const event = contentAppliedEvent(chapter, command, timestamp)
    return {
      streams: [{ stream, expectedVersion: loaded.version, events: [event] }],
      result: { chapter, versionId: event.eventId },
    }
  })

  runtime.commands.register(RECORD_CHAPTER_VERSION_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const timestamp = now()
    const content = nonEmptyString(command.payload, 'content')
    const version: ChapterVersionSnapshot = {
      id: generateId(),
      projectId: command.projectId!,
      chapterId: command.aggregateId,
      content,
      wordCount: content.length,
      note: nullableString(command.payload, 'note'),
      createdAt: timestamp,
    }
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: [pendingEvent(CHAPTER_VERSION_RECORDED, { version }, command, timestamp)],
      }],
      result: { versionId: version.id, version },
    }
  })

  runtime.commands.register(PLAN_SCENES_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const inputs = objectArray(command.payload, 'scenes')
    const mode = command.payload.mode ?? 'append'
    if (mode !== 'append' && mode !== 'replace')
      throw new DomainCommandError('INVALID_SCENE', 'mode must be append or replace')
    if (inputs.length === 0 && mode === 'append')
      throw new DomainCommandError('INVALID_SCENE', 'append scenes must be a non-empty array')

    const timestamp = now()
    const currentScenes = Object.values(loaded.state.scenes ?? {})
    const events: PendingEvent[] = []
    if (mode === 'replace') {
      for (const scene of currentScenes)
        events.push(deletedSceneEvent(scene, command, timestamp))
    }
    const existingCount = mode === 'replace' ? 0 : currentScenes.length
    const existingIds = new Set(mode === 'replace' ? [] : currentScenes.map(scene => scene.id))
    const planned = inputs.map((input, index) => {
      const id = 'id' in input ? requiredString(input, 'id') : generateId()
      if (existingIds.has(id))
        throw new DomainCommandError('SCENE_ALREADY_EXISTS', 'Scene already exists')
      existingIds.add(id)
      return createSceneSnapshot(
        command,
        { ...input, id },
        existingCount + index + 1,
        timestamp,
      )
    })
    events.push(...planned.map(scene => sceneEvent(SCENE_PLANNED, scene, command, timestamp)))
    const result = mode === 'replace'
      ? planned
      : sortScenes([...currentScenes, ...planned])
    return {
      streams: events.length > 0 ? [{ stream, expectedVersion: loaded.version, events }] : [],
      result: { scenes: result },
    }
  })

  runtime.commands.register(CHANGE_SCENE_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    const current = loaded.state.scenes[id]
    if (!current)
      throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
    const timestamp = now()
    const scene = changeSceneSnapshot(current, command.payload, timestamp)
    const changedDetails = SCENE_DETAIL_FIELDS.some(field => (
      field in command.payload && scene[field] !== current[field]
    ))
    const contentChanged = 'content' in command.payload && scene.content !== current.content
    const events: PendingEvent[] = []
    if (changedDetails || !contentChanged)
      events.push(sceneEvent(SCENE_CHANGED, scene, command, timestamp))
    if (contentChanged)
      events.push(sceneEvent(SCENE_CONTENT_APPLIED, scene, command, timestamp))
    return {
      streams: [{ stream, expectedVersion: loaded.version, events }],
      result: scene,
    }
  })

  runtime.commands.register(REORDER_SCENES_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const orders = objectArray(command.payload, 'orders')
    const seen = new Set<string>()
    const timestamp = now()
    const changed = orders.map((order) => {
      const id = requiredString(order, 'id')
      if (seen.has(id))
        throw new DomainCommandError('INVALID_SCENE_ORDER', 'Scene order contains duplicate IDs')
      seen.add(id)
      const current = loaded.state.scenes[id]
      if (!current)
        throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
      return {
        ...current,
        orderIndex: requiredInteger(order, 'orderIndex', 0),
        updatedAt: timestamp,
      }
    })
    const changedById = Object.fromEntries(changed.map(scene => [scene.id, scene]))
    const result = sortScenes(Object.values(loaded.state.scenes).map(scene => (
      changedById[scene.id] ?? scene
    )))
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: changed.map(scene => sceneEvent(SCENE_REORDERED, scene, command, timestamp)),
      }],
      result: { scenes: result },
    }
  })

  runtime.commands.register(DELETE_SCENE_COMMAND, async (command, context) => {
    const stream = chapterStream(command)
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    const scene = loaded.state.scenes[id]
    if (!scene)
      throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
    const timestamp = now()
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: [deletedSceneEvent(scene, command, timestamp)],
      }],
      result: scene,
    }
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: CHAPTER_PROJECTION,
    mode: 'sync',
    handles: [
      ...FULL_CHAPTER_EVENTS,
      ...FULL_SCENE_EVENTS,
      CHAPTER_DELETED,
      CHAPTER_VERSION_RECORDED,
      SCENE_DELETED,
      PROJECT_DELETED,
    ],
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
      if (event.eventType === SCENE_DELETED) {
        const { scene } = readDeletedSceneEvent(event.payload)
        await transaction.delete(chapterScenes).where(and(
          eq(chapterScenes.projectId, scene.projectId),
          eq(chapterScenes.chapterId, scene.chapterId),
          eq(chapterScenes.id, scene.id),
        ))
        return
      }
      if (event.eventType === CHAPTER_VERSION_RECORDED) {
        await transaction.insert(chapterVersions)
          .values(readVersionEvent(event.payload))
          .onConflictDoNothing()
        return
      }
      if (FULL_SCENE_EVENTS.includes(event.eventType as typeof FULL_SCENE_EVENTS[number])) {
        const scene = readSceneEvent(event.payload)
        await transaction.insert(chapterScenes).values(scene).onConflictDoUpdate({
          target: chapterScenes.id,
          set: scene,
        })
        return
      }
      const chapter = readChapterEvent(event.payload)
      await transaction.insert(chapters).values(chapter).onConflictDoUpdate({
        target: chapters.id,
        set: chapter,
      })
      if (
        chapter.draft
        && (event.eventType === CHAPTER_CREATED || event.eventType === CHAPTER_CONTENT_APPLIED)
      ) {
        await transaction.insert(chapterVersions).values({
          id: event.eventId,
          projectId: chapter.projectId,
          chapterId: chapter.id,
          content: chapter.draft,
          wordCount: chapter.draft.length,
          note: event.eventType === CHAPTER_CREATED
            ? 'Initial draft'
            : nullableString(event.payload, 'note') ?? 'Content applied',
          createdAt: event.occurredAt,
        }).onConflictDoNothing()
      }
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

async function loadActiveChapter(
  runtime: ChapterEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(
    session,
    chapterAggregate,
    chapterStream(command),
  )
  assertActiveChapter(loaded.state)
  return loaded
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

function createSceneSnapshot(
  command: CommandEnvelope,
  input: JsonObject,
  fallbackIndex: number,
  timestamp: string,
): SceneSnapshot {
  return {
    id: requiredString(input, 'id'),
    projectId: command.projectId!,
    chapterId: command.aggregateId,
    sceneNumber: 'sceneNumber' in input
      ? requiredInteger(input, 'sceneNumber', 1)
      : fallbackIndex,
    title: nullableString(input, 'title'),
    location: nullableString(input, 'location'),
    timeline: nullableString(input, 'timeline'),
    purpose: nullableString(input, 'purpose'),
    summary: nullableString(input, 'summary'),
    characters: nullableString(input, 'characters'),
    targetWords: nullableInteger(input, 'targetWords', 0),
    content: nullableString(input, 'content'),
    orderIndex: 'orderIndex' in input
      ? requiredInteger(input, 'orderIndex', 0)
      : fallbackIndex,
    status: sceneStatus(input.status ?? 'planned'),
    conflict: nullableString(input, 'conflict'),
    beatType: sceneBeatType(input.beatType),
    entryHook: nullableString(input, 'entryHook'),
    turningPoint: nullableString(input, 'turningPoint'),
    exitHook: nullableString(input, 'exitHook'),
    emotionStart: nullableString(input, 'emotionStart'),
    emotionEnd: nullableString(input, 'emotionEnd'),
    conflictLevel: nullableInteger(input, 'conflictLevel', 0),
    requiredElements: nullableString(input, 'requiredElements'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeSceneSnapshot(
  current: SceneSnapshot,
  input: JsonObject,
  timestamp: string,
): SceneSnapshot {
  return {
    ...current,
    sceneNumber: 'sceneNumber' in input
      ? requiredInteger(input, 'sceneNumber', 1)
      : current.sceneNumber,
    title: optionalNullableString(input, 'title', current.title),
    location: optionalNullableString(input, 'location', current.location),
    timeline: optionalNullableString(input, 'timeline', current.timeline),
    purpose: optionalNullableString(input, 'purpose', current.purpose),
    summary: optionalNullableString(input, 'summary', current.summary),
    characters: optionalNullableString(input, 'characters', current.characters),
    targetWords: 'targetWords' in input
      ? nullableInteger(input, 'targetWords', 0)
      : current.targetWords,
    content: optionalNullableString(input, 'content', current.content),
    orderIndex: 'orderIndex' in input
      ? requiredInteger(input, 'orderIndex', 0)
      : current.orderIndex,
    status: 'status' in input ? sceneStatus(input.status) : current.status,
    conflict: optionalNullableString(input, 'conflict', current.conflict),
    beatType: 'beatType' in input ? sceneBeatType(input.beatType) : current.beatType,
    entryHook: optionalNullableString(input, 'entryHook', current.entryHook),
    turningPoint: optionalNullableString(input, 'turningPoint', current.turningPoint),
    exitHook: optionalNullableString(input, 'exitHook', current.exitHook),
    emotionStart: optionalNullableString(input, 'emotionStart', current.emotionStart),
    emotionEnd: optionalNullableString(input, 'emotionEnd', current.emotionEnd),
    conflictLevel: 'conflictLevel' in input
      ? nullableInteger(input, 'conflictLevel', 0)
      : current.conflictLevel,
    requiredElements: optionalNullableString(input, 'requiredElements', current.requiredElements),
    updatedAt: timestamp,
  }
}

function sceneEvent(
  eventType: string,
  scene: SceneSnapshot,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(eventType, { scene }, command, occurredAt)
}

function deletedSceneEvent(
  scene: SceneSnapshot,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(SCENE_DELETED, { scene, deletedAt: occurredAt }, command, occurredAt)
}

function sortScenes(scenes: SceneSnapshot[]): SceneSnapshot[] {
  return [...scenes].sort((left, right) => (
    left.orderIndex - right.orderIndex || left.sceneNumber - right.sceneNumber
  ))
}

function chapterEvent(
  eventType: string,
  chapter: ChapterSnapshot,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(eventType, { chapter }, command, occurredAt)
}

function contentAppliedEvent(
  chapter: ChapterSnapshot,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(CHAPTER_CONTENT_APPLIED, {
    chapter,
    note: nullableString(command.payload, 'note'),
  }, command, occurredAt)
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

function validateContentAppliedEvent(payload: unknown): JsonObject {
  const value = readObject(payload)
  return {
    chapter: readChapterEvent(value),
    note: nullableString(value, 'note'),
  }
}

function validateVersionRecordedEvent(payload: unknown): JsonObject {
  return { version: readVersionEvent(readObject(payload)) }
}

function readVersionEvent(payload: JsonObject): ChapterVersionSnapshot {
  const value = 'version' in payload ? readObject(payload.version) : payload
  const content = nonEmptyString(value, 'content')
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    chapterId: requiredString(value, 'chapterId'),
    content,
    wordCount: requiredInteger(value, 'wordCount', 1),
    note: nullableString(value, 'note'),
    createdAt: requiredString(value, 'createdAt'),
  }
}

function readSceneEvent(payload: JsonObject): SceneSnapshot {
  const value = 'scene' in payload ? readObject(payload.scene) : payload
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    chapterId: requiredString(value, 'chapterId'),
    sceneNumber: requiredInteger(value, 'sceneNumber', 1),
    title: nullableString(value, 'title'),
    location: nullableString(value, 'location'),
    timeline: nullableString(value, 'timeline'),
    purpose: nullableString(value, 'purpose'),
    summary: nullableString(value, 'summary'),
    characters: nullableString(value, 'characters'),
    targetWords: nullableInteger(value, 'targetWords', 0),
    content: nullableString(value, 'content'),
    orderIndex: requiredInteger(value, 'orderIndex', 0),
    status: sceneStatus(value.status),
    conflict: nullableString(value, 'conflict'),
    beatType: sceneBeatType(value.beatType),
    entryHook: nullableString(value, 'entryHook'),
    turningPoint: nullableString(value, 'turningPoint'),
    exitHook: nullableString(value, 'exitHook'),
    emotionStart: nullableString(value, 'emotionStart'),
    emotionEnd: nullableString(value, 'emotionEnd'),
    conflictLevel: nullableInteger(value, 'conflictLevel', 0),
    requiredElements: nullableString(value, 'requiredElements'),
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

function validateDeletedSceneEvent(payload: unknown): JsonObject {
  const value = readObject(payload)
  return {
    scene: readSceneEvent(readObject(value.scene)),
    deletedAt: requiredString(value, 'deletedAt'),
  }
}

function readDeletedSceneEvent(payload: JsonObject): { scene: SceneSnapshot, deletedAt: string } {
  const value = validateDeletedSceneEvent(payload)
  return {
    scene: readSceneEvent(readObject(value.scene)),
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
  return payloadCodec.string(record, key)
}

function nonEmptyString(record: JsonObject, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim())
    throw new DomainCommandError('INVALID_CHAPTER', `${key} must be a non-empty string`)
  return value
}

function nullableString(record: JsonObject, key: string): string | null {
  return payloadCodec.nullableString(record, key)
}

function optionalNullableString(record: JsonObject, key: string, fallback: string | null): string | null {
  return key in record ? nullableString(record, key) : fallback
}

function requiredInteger(record: JsonObject, key: string, minimum: number): number {
  return payloadCodec.integer(record, key, { minimum })
}

function nullableInteger(record: JsonObject, key: string, minimum: number): number | null {
  const value = record[key]
  if (value === undefined || value === null)
    return null
  if (!Number.isInteger(value) || (value as number) < minimum)
    throw new DomainCommandError('INVALID_SCENE', `${key} must be null or an integer >= ${minimum}`)
  return value as number
}

function chapterStatus(value: unknown): ChapterStatus {
  if (!CHAPTER_STATUSES.includes(value as ChapterStatus))
    throw new DomainCommandError('INVALID_CHAPTER', `Unsupported chapter status: ${String(value)}`)
  return value as ChapterStatus
}

function sceneStatus(value: unknown): SceneStatus {
  if (!SCENE_STATUSES.includes(value as SceneStatus))
    throw new DomainCommandError('INVALID_SCENE', `Unsupported scene status: ${String(value)}`)
  return value as SceneStatus
}

function sceneBeatType(value: unknown): SceneBeatType | null {
  if (value === undefined || value === null)
    return null
  if (!SCENE_BEAT_TYPES.includes(value as SceneBeatType))
    throw new DomainCommandError('INVALID_SCENE', `Unsupported scene beat type: ${String(value)}`)
  return value as SceneBeatType
}

function objectArray(record: JsonObject, key: string): JsonObject[] {
  return payloadCodec.objectArray(record, key)
}

function readObject(value: unknown): JsonObject {
  return payloadCodec.object(value)
}
