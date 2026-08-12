import type { AggregateDefinition, AggregateRepository, CommandBus, CommandEnvelope, EventRegistry, JsonObject, PendingEvent, ProjectionRegistry, StreamRef } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { authoringEvents, knowledgeChunks, knowledgeNotes, knowledgeSources, storyFactTriples } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { PROJECT_AGGREGATE_TYPE, PROJECT_DELETED, projectAggregate } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE = 'NarrativeKnowledge'
export const NARRATIVE_KNOWLEDGE_PROJECTION = 'narrative-knowledge'

export const RECORD_STORY_FACT_COMMAND = 'RecordStoryFact'
export const CHANGE_STORY_FACT_COMMAND = 'ChangeStoryFact'
export const REMOVE_STORY_FACT_COMMAND = 'RemoveStoryFact'
export const ADD_KNOWLEDGE_SOURCE_COMMAND = 'AddKnowledgeSource'
export const REMOVE_KNOWLEDGE_SOURCE_COMMAND = 'RemoveKnowledgeSource'
export const ADD_KNOWLEDGE_CHUNK_COMMAND = 'AddKnowledgeChunk'
export const ADD_KNOWLEDGE_NOTE_COMMAND = 'AddKnowledgeNote'
export const RECORD_AUTHORING_EVENT_COMMAND = 'RecordAuthoringEvent'

export const STORY_FACT_RECORDED = 'StoryFactRecorded'
export const STORY_FACT_CHANGED = 'StoryFactChanged'
export const STORY_FACT_REMOVED = 'StoryFactRemoved'
export const KNOWLEDGE_SOURCE_ADDED = 'KnowledgeSourceAdded'
export const KNOWLEDGE_SOURCE_REMOVED = 'KnowledgeSourceRemoved'
export const KNOWLEDGE_CHUNK_ADDED = 'KnowledgeChunkAdded'
export const KNOWLEDGE_NOTE_ADDED = 'KnowledgeNoteAdded'
export const AUTHORING_ACTIVITY_RECORDED = 'AuthoringActivityRecorded'

const FACT_SOURCES = ['manual', 'ai_extracted', 'auto_inferred'] as const
const FACT_STATUSES = ['pending', 'confirmed', 'rejected'] as const
const SOURCE_TYPES = ['classic', 'reference', 'personal'] as const
const SOURCE_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const
const payloadCodec = createPayloadCodec('INVALID_NARRATIVE_KNOWLEDGE', 'Narrative knowledge payload')

export type StoryFactSnapshot = JsonObject & {
  id: string
  projectId: string
  subjectType: string
  subjectName: string
  predicate: string
  objectType: string
  objectName: string
  confidence: number
  sourceType: typeof FACT_SOURCES[number]
  sourceChapterId: string | null
  status: typeof FACT_STATUSES[number]
  relatedChapters: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type KnowledgeSourceSnapshot = JsonObject & {
  id: string
  projectId: string
  title: string
  author: string | null
  sourceType: typeof SOURCE_TYPES[number]
  fileName: string | null
  fileSize: number | null
  status: typeof SOURCE_STATUSES[number]
  createdAt: string
  updatedAt: string
}

type KnowledgeChunkSnapshot = JsonObject & {
  id: string
  sourceId: string
  projectId: string
  chunkType: string
  title: string | null
  content: string
  summary: string | null
  techniques: string | null
  orderIndex: number
  importance: number
  lastRetrievedAt: number | null
  createdAt: string
}

type KnowledgeNoteSnapshot = JsonObject & {
  id: string
  sourceId: string | null
  projectId: string
  title: string
  content: string
  tags: string | null
  createdAt: string
}

export type AuthoringActivitySnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string | null
  sceneId: string | null
  eventType: string
  source: string
  payload: unknown
  createdAt: string
}

interface NarrativeKnowledgeState extends JsonObject {
  exists: boolean
  projectId: string
  facts: Record<string, StoryFactSnapshot>
  sources: Record<string, KnowledgeSourceSnapshot>
  chunks: Record<string, KnowledgeChunkSnapshot>
  notes: Record<string, KnowledgeNoteSnapshot>
  activities: Record<string, AuthoringActivitySnapshot>
}

export interface NarrativeKnowledgeEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const narrativeKnowledgeAggregate: AggregateDefinition<NarrativeKnowledgeState> = {
  aggregateType: NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({ exists: false, projectId: '', facts: {}, sources: {}, chunks: {}, notes: {}, activities: {} }),
  evolve: (state, event) => {
    if (event.eventType === STORY_FACT_RECORDED || event.eventType === STORY_FACT_CHANGED) {
      const fact = readFact(event.payload)
      return { ...state, exists: true, projectId: fact.projectId, facts: { ...state.facts, [fact.id]: fact } }
    }
    if (event.eventType === STORY_FACT_REMOVED) {
      const { fact } = readRemovedFact(event.payload)
      const facts = { ...state.facts }
      delete facts[fact.id]
      return { ...state, facts }
    }
    if (event.eventType === KNOWLEDGE_SOURCE_ADDED) {
      const source = readSource(event.payload)
      return { ...state, exists: true, projectId: source.projectId, sources: { ...state.sources, [source.id]: source } }
    }
    if (event.eventType === KNOWLEDGE_SOURCE_REMOVED) {
      const { source } = readRemovedSource(event.payload)
      const sources = { ...state.sources }
      const chunks = Object.fromEntries(Object.entries(state.chunks).filter(([, row]) => row.sourceId !== source.id))
      const notes = Object.fromEntries(Object.entries(state.notes).filter(([, row]) => row.sourceId !== source.id))
      delete sources[source.id]
      return { ...state, sources, chunks, notes }
    }
    if (event.eventType === KNOWLEDGE_CHUNK_ADDED) {
      const chunk = readChunk(event.payload)
      return { ...state, chunks: { ...state.chunks, [chunk.id]: chunk } }
    }
    if (event.eventType === KNOWLEDGE_NOTE_ADDED) {
      const note = readNote(event.payload)
      return { ...state, notes: { ...state.notes, [note.id]: note } }
    }
    if (event.eventType === AUTHORING_ACTIVITY_RECORDED) {
      const activity = readActivity(event.payload)
      return { ...state, exists: true, projectId: activity.projectId, activities: { ...state.activities, [activity.id]: activity } }
    }
    return state
  },
}

export function registerNarrativeKnowledgeEventing(runtime: NarrativeKnowledgeEventingRuntime): void {
  const registrations: Array<[string, (payload: JsonObject) => JsonObject]> = [
    [STORY_FACT_RECORDED, payload => ({ fact: readFact(payload) })],
    [STORY_FACT_CHANGED, payload => ({ fact: readFact(payload) })],
    [STORY_FACT_REMOVED, validateFactRemoved],
    [KNOWLEDGE_SOURCE_ADDED, payload => ({ source: readSource(payload) })],
    [KNOWLEDGE_SOURCE_REMOVED, validateSourceRemoved],
    [KNOWLEDGE_CHUNK_ADDED, payload => ({ chunk: readChunk(payload) })],
    [KNOWLEDGE_NOTE_ADDED, payload => ({ note: readNote(payload) })],
    [AUTHORING_ACTIVITY_RECORDED, payload => ({ activity: readActivity(payload) })],
  ]
  for (const [eventType, validate] of registrations)
    runtime.events.register({ eventType, currentSchemaVersion: 1, upcasters: {}, validate: payload => validate(payloadCodec.object(payload)) })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: NarrativeKnowledgeEventingRuntime): void {
  runtime.commands.register(RECORD_STORY_FACT_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    if (loaded.state.facts[id])
      throw new DomainCommandError('STORY_FACT_ALREADY_EXISTS', 'Story fact already exists')
    await assertChapter(runtime, context.session, command.projectId!, payloadCodec.nullableString(command.payload, 'sourceChapterId'))
    const timestamp = now()
    const fact = createFact(command, timestamp)
    if (Object.values(loaded.state.facts).some(row => factKey(row) === factKey(fact)))
      throw new DomainCommandError('STORY_FACT_ALREADY_EXISTS', 'Story fact already exists')
    return decision(loaded.version, command, STORY_FACT_RECORDED, { fact }, fact, timestamp)
  })
  runtime.commands.register(CHANGE_STORY_FACT_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const current = loaded.state.facts[id]
    if (!current)
      throw new DomainCommandError('STORY_FACT_NOT_FOUND', 'Story fact not found')
    const chapterId = payloadCodec.nextNullableString(command.payload, 'sourceChapterId', current.sourceChapterId)
    await assertChapter(runtime, context.session, command.projectId!, chapterId)
    const timestamp = now()
    const fact = changeFact(current, command.payload, timestamp)
    return decision(loaded.version, command, STORY_FACT_CHANGED, { fact }, fact, timestamp)
  })
  runtime.commands.register(REMOVE_STORY_FACT_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const fact = loaded.state.facts[payloadCodec.string(command.payload, 'id')]
    if (!fact)
      throw new DomainCommandError('STORY_FACT_NOT_FOUND', 'Story fact not found')
    const timestamp = now()
    return decision(loaded.version, command, STORY_FACT_REMOVED, { fact, removedAt: timestamp }, fact, timestamp)
  })
  runtime.commands.register(ADD_KNOWLEDGE_SOURCE_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    if (loaded.state.sources[id])
      throw new DomainCommandError('KNOWLEDGE_SOURCE_ALREADY_EXISTS', 'Knowledge source already exists')
    const timestamp = now()
    const source = createSource(command, timestamp)
    return decision(loaded.version, command, KNOWLEDGE_SOURCE_ADDED, { source }, source, timestamp)
  })
  runtime.commands.register(REMOVE_KNOWLEDGE_SOURCE_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const source = loaded.state.sources[payloadCodec.string(command.payload, 'id')]
    if (!source)
      throw new DomainCommandError('KNOWLEDGE_SOURCE_NOT_FOUND', 'Knowledge source not found')
    const timestamp = now()
    return decision(loaded.version, command, KNOWLEDGE_SOURCE_REMOVED, { source, removedAt: timestamp }, source, timestamp)
  })
  runtime.commands.register(ADD_KNOWLEDGE_CHUNK_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const sourceId = payloadCodec.string(command.payload, 'sourceId')
    if (!loaded.state.sources[sourceId])
      throw new DomainCommandError('KNOWLEDGE_SOURCE_NOT_FOUND', 'Knowledge source not found')
    if (loaded.state.chunks[id])
      throw new DomainCommandError('KNOWLEDGE_CHUNK_ALREADY_EXISTS', 'Knowledge chunk already exists')
    const timestamp = now()
    const chunk = createChunk(command, timestamp)
    return decision(loaded.version, command, KNOWLEDGE_CHUNK_ADDED, { chunk }, chunk, timestamp)
  })
  runtime.commands.register(ADD_KNOWLEDGE_NOTE_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const sourceId = payloadCodec.nullableString(command.payload, 'sourceId')
    if (sourceId && !loaded.state.sources[sourceId])
      throw new DomainCommandError('KNOWLEDGE_SOURCE_NOT_FOUND', 'Knowledge source not found')
    if (loaded.state.notes[id])
      throw new DomainCommandError('KNOWLEDGE_NOTE_ALREADY_EXISTS', 'Knowledge note already exists')
    const timestamp = now()
    const note = createNote(command, timestamp)
    return decision(loaded.version, command, KNOWLEDGE_NOTE_ADDED, { note }, note, timestamp)
  })
  runtime.commands.register(RECORD_AUTHORING_EVENT_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    if (loaded.state.activities[id])
      throw new DomainCommandError('AUTHORING_ACTIVITY_ALREADY_EXISTS', 'Authoring activity already exists')
    await assertChapter(runtime, context.session, command.projectId!, payloadCodec.nullableString(command.payload, 'chapterId'))
    const timestamp = now()
    const activity = createActivity(command, timestamp)
    return decision(loaded.version, command, AUTHORING_ACTIVITY_RECORDED, { activity }, activity, timestamp)
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: NARRATIVE_KNOWLEDGE_PROJECTION,
    mode: 'sync',
    handles: [STORY_FACT_RECORDED, STORY_FACT_CHANGED, STORY_FACT_REMOVED, KNOWLEDGE_SOURCE_ADDED, KNOWLEDGE_SOURCE_REMOVED, KNOWLEDGE_CHUNK_ADDED, KNOWLEDGE_NOTE_ADDED, AUTHORING_ACTIVITY_RECORDED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await resetProjection(transaction, event.aggregateId)
        return
      }
      if (event.eventType === STORY_FACT_RECORDED) {
        await transaction.insert(storyFactTriples).values(readFact(event.payload))
        return
      }
      if (event.eventType === STORY_FACT_CHANGED) {
        const fact = readFact(event.payload)
        await transaction.update(storyFactTriples).set(fact).where(and(eq(storyFactTriples.id, fact.id), eq(storyFactTriples.projectId, fact.projectId)))
        return
      }
      if (event.eventType === STORY_FACT_REMOVED) {
        const { fact } = readRemovedFact(event.payload)
        await transaction.delete(storyFactTriples).where(and(eq(storyFactTriples.id, fact.id), eq(storyFactTriples.projectId, fact.projectId)))
        return
      }
      if (event.eventType === KNOWLEDGE_SOURCE_ADDED) {
        await transaction.insert(knowledgeSources).values(readSource(event.payload))
        return
      }
      if (event.eventType === KNOWLEDGE_SOURCE_REMOVED) {
        const { source } = readRemovedSource(event.payload)
        await transaction.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id))
        await transaction.delete(knowledgeNotes).where(eq(knowledgeNotes.sourceId, source.id))
        await transaction.delete(knowledgeSources).where(and(eq(knowledgeSources.id, source.id), eq(knowledgeSources.projectId, source.projectId)))
        return
      }
      if (event.eventType === KNOWLEDGE_CHUNK_ADDED) {
        await transaction.insert(knowledgeChunks).values(readChunk(event.payload))
        return
      }
      if (event.eventType === KNOWLEDGE_NOTE_ADDED) {
        await transaction.insert(knowledgeNotes).values(readNote(event.payload))
        return
      }
      await transaction.insert(authoringEvents).values(readActivity(event.payload))
    },
    reset: resetProjection,
  })
}

async function resetProjection(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  const tables = [authoringEvents, knowledgeChunks, knowledgeNotes, knowledgeSources, storyFactTriples] as const
  for (const table of tables) {
    if (projectId)
      await transaction.delete(table).where(eq(table.projectId, projectId))
    else
      await transaction.delete(table)
  }
}

async function loadActive(runtime: NarrativeKnowledgeEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  if (!command.projectId || command.aggregateType !== NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE || command.aggregateId !== command.projectId)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Narrative knowledge command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, { aggregateType: PROJECT_AGGREGATE_TYPE, aggregateId: command.projectId, projectId: command.projectId })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
  return runtime.aggregates.loadInSession(session, narrativeKnowledgeAggregate, stream(command))
}

async function assertChapter(runtime: NarrativeKnowledgeEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, chapterId: string | null) {
  if (!chapterId)
    return
  const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, { aggregateType: CHAPTER_AGGREGATE_TYPE, aggregateId: chapterId, projectId })
  if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
    throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
}

function createFact(command: CommandEnvelope, timestamp: string): StoryFactSnapshot {
  return {
    id: payloadCodec.string(command.payload, 'id'),
    projectId: command.projectId!,
    subjectType: payloadCodec.string(command.payload, 'subjectType'),
    subjectName: payloadCodec.string(command.payload, 'subjectName'),
    predicate: payloadCodec.string(command.payload, 'predicate'),
    objectType: payloadCodec.string(command.payload, 'objectType'),
    objectName: payloadCodec.string(command.payload, 'objectName'),
    confidence: 'confidence' in command.payload ? payloadCodec.integer(command.payload, 'confidence') : 70,
    sourceType: 'sourceType' in command.payload ? payloadCodec.enum(command.payload, 'sourceType', FACT_SOURCES) : 'manual',
    sourceChapterId: payloadCodec.nullableString(command.payload, 'sourceChapterId'),
    status: 'status' in command.payload ? payloadCodec.enum(command.payload, 'status', FACT_STATUSES) : 'pending',
    relatedChapters: payloadCodec.nullableString(command.payload, 'relatedChapters'),
    notes: payloadCodec.nullableString(command.payload, 'notes'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeFact(current: StoryFactSnapshot, input: JsonObject, timestamp: string): StoryFactSnapshot {
  return {
    ...current,
    subjectType: 'subjectType' in input ? payloadCodec.string(input, 'subjectType') : current.subjectType,
    subjectName: 'subjectName' in input ? payloadCodec.string(input, 'subjectName') : current.subjectName,
    predicate: 'predicate' in input ? payloadCodec.string(input, 'predicate') : current.predicate,
    objectType: 'objectType' in input ? payloadCodec.string(input, 'objectType') : current.objectType,
    objectName: 'objectName' in input ? payloadCodec.string(input, 'objectName') : current.objectName,
    confidence: 'confidence' in input ? payloadCodec.integer(input, 'confidence') : current.confidence,
    sourceType: 'sourceType' in input ? payloadCodec.enum(input, 'sourceType', FACT_SOURCES) : current.sourceType,
    sourceChapterId: payloadCodec.nextNullableString(input, 'sourceChapterId', current.sourceChapterId),
    status: 'status' in input ? payloadCodec.enum(input, 'status', FACT_STATUSES) : current.status,
    relatedChapters: payloadCodec.nextNullableString(input, 'relatedChapters', current.relatedChapters),
    notes: payloadCodec.nextNullableString(input, 'notes', current.notes),
    updatedAt: timestamp,
  }
}

function createSource(command: CommandEnvelope, timestamp: string): KnowledgeSourceSnapshot {
  return { id: payloadCodec.string(command.payload, 'id'), projectId: command.projectId!, title: payloadCodec.string(command.payload, 'title'), author: payloadCodec.nullableString(command.payload, 'author'), sourceType: payloadCodec.enum(command.payload, 'sourceType', SOURCE_TYPES), fileName: payloadCodec.nullableString(command.payload, 'fileName'), fileSize: payloadCodec.nullableInteger(command.payload, 'fileSize'), status: 'status' in command.payload ? payloadCodec.enum(command.payload, 'status', SOURCE_STATUSES) : 'pending', createdAt: timestamp, updatedAt: timestamp }
}

function createChunk(command: CommandEnvelope, timestamp: string): KnowledgeChunkSnapshot {
  return { id: payloadCodec.string(command.payload, 'id'), sourceId: payloadCodec.string(command.payload, 'sourceId'), projectId: command.projectId!, chunkType: payloadCodec.string(command.payload, 'chunkType'), title: payloadCodec.nullableString(command.payload, 'title'), content: payloadCodec.string(command.payload, 'content'), summary: payloadCodec.nullableString(command.payload, 'summary'), techniques: payloadCodec.nullableString(command.payload, 'techniques'), orderIndex: payloadCodec.integer(command.payload, 'orderIndex'), importance: 'importance' in command.payload ? payloadCodec.integer(command.payload, 'importance') : 5, lastRetrievedAt: payloadCodec.nullableInteger(command.payload, 'lastRetrievedAt'), createdAt: timestamp }
}

function createNote(command: CommandEnvelope, timestamp: string): KnowledgeNoteSnapshot {
  return { id: payloadCodec.string(command.payload, 'id'), sourceId: payloadCodec.nullableString(command.payload, 'sourceId'), projectId: command.projectId!, title: payloadCodec.string(command.payload, 'title'), content: payloadCodec.string(command.payload, 'content'), tags: payloadCodec.nullableString(command.payload, 'tags'), createdAt: timestamp }
}

function createActivity(command: CommandEnvelope, timestamp: string): AuthoringActivitySnapshot {
  return { id: payloadCodec.string(command.payload, 'id'), projectId: command.projectId!, chapterId: payloadCodec.nullableString(command.payload, 'chapterId'), sceneId: payloadCodec.nullableString(command.payload, 'sceneId'), eventType: payloadCodec.string(command.payload, 'eventType'), source: payloadCodec.string(command.payload, 'source'), payload: command.payload.payload ?? null, createdAt: timestamp }
}

function readFact(payload: JsonObject): StoryFactSnapshot {
  const value = 'fact' in payload ? payloadCodec.object(payload.fact) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    subjectType: payloadCodec.string(value, 'subjectType'),
    subjectName: payloadCodec.string(value, 'subjectName'),
    predicate: payloadCodec.string(value, 'predicate'),
    objectType: payloadCodec.string(value, 'objectType'),
    objectName: payloadCodec.string(value, 'objectName'),
    confidence: payloadCodec.integer(value, 'confidence'),
    sourceType: payloadCodec.enum(value, 'sourceType', FACT_SOURCES),
    sourceChapterId: payloadCodec.nullableString(value, 'sourceChapterId'),
    status: payloadCodec.enum(value, 'status', FACT_STATUSES),
    relatedChapters: payloadCodec.nullableString(value, 'relatedChapters'),
    notes: payloadCodec.nullableString(value, 'notes'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function readSource(payload: JsonObject): KnowledgeSourceSnapshot {
  const value = 'source' in payload ? payloadCodec.object(payload.source) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    title: payloadCodec.string(value, 'title'),
    author: payloadCodec.nullableString(value, 'author'),
    sourceType: payloadCodec.enum(value, 'sourceType', SOURCE_TYPES),
    fileName: payloadCodec.nullableString(value, 'fileName'),
    fileSize: payloadCodec.nullableInteger(value, 'fileSize'),
    status: payloadCodec.enum(value, 'status', SOURCE_STATUSES),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function readChunk(payload: JsonObject): KnowledgeChunkSnapshot {
  const value = 'chunk' in payload ? payloadCodec.object(payload.chunk) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    sourceId: payloadCodec.string(value, 'sourceId'),
    projectId: payloadCodec.string(value, 'projectId'),
    chunkType: payloadCodec.string(value, 'chunkType'),
    title: payloadCodec.nullableString(value, 'title'),
    content: payloadCodec.string(value, 'content'),
    summary: payloadCodec.nullableString(value, 'summary'),
    techniques: payloadCodec.nullableString(value, 'techniques'),
    orderIndex: payloadCodec.integer(value, 'orderIndex'),
    importance: payloadCodec.integer(value, 'importance'),
    lastRetrievedAt: payloadCodec.nullableInteger(value, 'lastRetrievedAt'),
    createdAt: payloadCodec.string(value, 'createdAt'),
  }
}

function readNote(payload: JsonObject): KnowledgeNoteSnapshot {
  const value = 'note' in payload ? payloadCodec.object(payload.note) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    sourceId: payloadCodec.nullableString(value, 'sourceId'),
    projectId: payloadCodec.string(value, 'projectId'),
    title: payloadCodec.string(value, 'title'),
    content: payloadCodec.string(value, 'content'),
    tags: payloadCodec.nullableString(value, 'tags'),
    createdAt: payloadCodec.string(value, 'createdAt'),
  }
}

function readActivity(payload: JsonObject): AuthoringActivitySnapshot {
  const value = 'activity' in payload ? payloadCodec.object(payload.activity) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    chapterId: payloadCodec.nullableString(value, 'chapterId'),
    sceneId: payloadCodec.nullableString(value, 'sceneId'),
    eventType: payloadCodec.string(value, 'eventType'),
    source: payloadCodec.string(value, 'source'),
    payload: value.payload ?? null,
    createdAt: payloadCodec.string(value, 'createdAt'),
  }
}

function validateFactRemoved(payload: JsonObject): JsonObject {
  return { fact: readFact(payloadCodec.object(payload.fact)), removedAt: payloadCodec.string(payload, 'removedAt') }
}

function readRemovedFact(payload: JsonObject) {
  const value = validateFactRemoved(payload)
  return { fact: readFact(payloadCodec.object(value.fact)), removedAt: payloadCodec.string(value, 'removedAt') }
}

function validateSourceRemoved(payload: JsonObject): JsonObject {
  return { source: readSource(payloadCodec.object(payload.source)), removedAt: payloadCodec.string(payload, 'removedAt') }
}

function readRemovedSource(payload: JsonObject) {
  const value = validateSourceRemoved(payload)
  return { source: readSource(payloadCodec.object(value.source)), removedAt: payloadCodec.string(value, 'removedAt') }
}
function factKey(fact: StoryFactSnapshot) {
  return [fact.subjectType, fact.subjectName, fact.predicate, fact.objectType, fact.objectName].join('\0')
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, eventType: string, payload: JsonObject, result: TResult, occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events: [pendingEvent(eventType, payload, command, occurredAt)] }], result }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  return { aggregateType: NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}
