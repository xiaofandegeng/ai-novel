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
import { chapterElements, chapterMemories } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { CHARACTER_AGGREGATE_TYPE, characterAggregate } from '../character/character.eventing'
import { PROJECT_DELETED } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from './chapter.eventing'

export const CHAPTER_KNOWLEDGE_AGGREGATE_TYPE = 'ChapterKnowledge'
export const CHAPTER_KNOWLEDGE_PROJECTION = 'chapter-knowledge'

export const ADD_CHAPTER_ELEMENT_COMMAND = 'AddChapterElement'
export const CHANGE_CHAPTER_ELEMENT_COMMAND = 'ChangeChapterElement'
export const REMOVE_CHAPTER_ELEMENT_COMMAND = 'RemoveChapterElement'
export const REPLACE_CHAPTER_ELEMENTS_COMMAND = 'ReplaceChapterElements'
export const RECORD_CHAPTER_MEMORY_COMMAND = 'RecordChapterMemory'

export const CHAPTER_ELEMENT_ADDED = 'ChapterElementAdded'
export const CHAPTER_ELEMENT_CHANGED = 'ChapterElementChanged'
export const CHAPTER_ELEMENT_REMOVED = 'ChapterElementRemoved'
export const CHAPTER_ELEMENTS_REPLACED = 'ChapterElementsReplaced'
export const CHAPTER_MEMORY_RECORDED = 'ChapterMemoryRecorded'

const ELEMENT_TYPES = ['character', 'location', 'item', 'organization', 'event'] as const
const RELATION_TYPES = ['appears', 'mentioned', 'scene', 'uses', 'involved', 'occurs'] as const
const IMPORTANCE_LEVELS = ['major', 'normal', 'minor'] as const
const MEMORY_FIELDS = [
  'summary',
  'keyEvents',
  'newFacts',
  'characterStateChanges',
  'relationshipChanges',
  'conflictProgress',
  'foreshadowingAdded',
  'foreshadowingResolved',
  'themeProgress',
  'styleNotes',
] as const
const payloadCodec = createPayloadCodec('INVALID_CHAPTER_KNOWLEDGE', 'Chapter knowledge payload')

type ElementType = typeof ELEMENT_TYPES[number]
type RelationType = typeof RELATION_TYPES[number]
type Importance = typeof IMPORTANCE_LEVELS[number]

export type ChapterElementSnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  elementType: ElementType
  elementId: string | null
  elementName: string
  relationType: RelationType
  importance: Importance
  appearanceOrder: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ChapterMemorySnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  summary: string | null
  keyEvents: string | null
  newFacts: string | null
  characterStateChanges: string | null
  relationshipChanges: string | null
  conflictProgress: string | null
  foreshadowingAdded: string | null
  foreshadowingResolved: string | null
  themeProgress: string | null
  styleNotes: string | null
  createdAt: string
  updatedAt: string
}

interface ChapterKnowledgeState extends JsonObject {
  exists: boolean
  projectId: string
  chapterId: string
  elements: Record<string, ChapterElementSnapshot>
  memory: ChapterMemorySnapshot | null
}

export interface ChapterKnowledgeEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const chapterKnowledgeAggregate: AggregateDefinition<ChapterKnowledgeState> = {
  aggregateType: CHAPTER_KNOWLEDGE_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({ exists: false, projectId: '', chapterId: '', elements: {}, memory: null }),
  evolve: (state, event) => {
    if (event.eventType === CHAPTER_ELEMENT_ADDED || event.eventType === CHAPTER_ELEMENT_CHANGED) {
      const element = readElement(event.payload)
      return { ...state, exists: true, projectId: element.projectId, chapterId: element.chapterId, elements: { ...state.elements, [element.id]: element } }
    }
    if (event.eventType === CHAPTER_ELEMENT_REMOVED) {
      const { element } = readRemovedElement(event.payload)
      const elements = { ...state.elements }
      delete elements[element.id]
      return { ...state, elements }
    }
    if (event.eventType === CHAPTER_ELEMENTS_REPLACED) {
      const elements = readElements(event.payload)
      return {
        ...state,
        exists: true,
        projectId: event.projectId ?? state.projectId,
        chapterId: event.aggregateId,
        elements: Object.fromEntries(elements.map(element => [element.id, element])),
      }
    }
    if (event.eventType === CHAPTER_MEMORY_RECORDED) {
      const memory = readMemory(event.payload)
      return { ...state, exists: true, projectId: memory.projectId, chapterId: memory.chapterId, memory }
    }
    return state
  },
}

export function registerChapterKnowledgeEventing(runtime: ChapterKnowledgeEventingRuntime): void {
  for (const eventType of [CHAPTER_ELEMENT_ADDED, CHAPTER_ELEMENT_CHANGED]) {
    runtime.events.register({ eventType, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ element: readElement(payloadCodec.object(payload)) }) })
  }
  runtime.events.register({ eventType: CHAPTER_ELEMENT_REMOVED, currentSchemaVersion: 1, upcasters: {}, validate: validateElementRemoved })
  runtime.events.register({ eventType: CHAPTER_ELEMENTS_REPLACED, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ elements: readElements(payloadCodec.object(payload)) }) })
  runtime.events.register({ eventType: CHAPTER_MEMORY_RECORDED, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ memory: readMemory(payloadCodec.object(payload)) }) })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: ChapterKnowledgeEventingRuntime): void {
  runtime.commands.register(ADD_CHAPTER_ELEMENT_COMMAND, async (command, context) => {
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    if (loaded.state.elements[id])
      throw new DomainCommandError('CHAPTER_ELEMENT_ALREADY_EXISTS', 'Chapter element already exists')
    const timestamp = now()
    const element = await createElement(runtime, context.session, command, command.payload, timestamp)
    assertUniqueElement(Object.values(loaded.state.elements), element)
    return decision(loaded.version, command, CHAPTER_ELEMENT_ADDED, { element }, element, timestamp)
  })

  runtime.commands.register(CHANGE_CHAPTER_ELEMENT_COMMAND, async (command, context) => {
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const current = loaded.state.elements[id]
    if (!current)
      throw new DomainCommandError('CHAPTER_ELEMENT_NOT_FOUND', 'Chapter element not found')
    const timestamp = now()
    const element = await changeElement(runtime, context.session, current, command.payload, timestamp)
    assertUniqueElement(Object.values(loaded.state.elements).filter(row => row.id !== id), element)
    return decision(loaded.version, command, CHAPTER_ELEMENT_CHANGED, { element }, element, timestamp)
  })

  runtime.commands.register(REMOVE_CHAPTER_ELEMENT_COMMAND, async (command, context) => {
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const element = loaded.state.elements[id]
    if (!element)
      throw new DomainCommandError('CHAPTER_ELEMENT_NOT_FOUND', 'Chapter element not found')
    const timestamp = now()
    return decision(loaded.version, command, CHAPTER_ELEMENT_REMOVED, { element, removedAt: timestamp }, element, timestamp)
  })

  runtime.commands.register(REPLACE_CHAPTER_ELEMENTS_COMMAND, async (command, context) => {
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const timestamp = now()
    const elements: ChapterElementSnapshot[] = []
    for (const input of payloadCodec.objectArray(command.payload, 'elements'))
      elements.push(await createElement(runtime, context.session, command, input, timestamp))
    const ids = elements.map(element => element.id)
    if (new Set(ids).size !== ids.length)
      throw new DomainCommandError('CHAPTER_ELEMENT_DUPLICATE', 'Chapter element IDs must be unique')
    for (const [index, element] of elements.entries())
      assertUniqueElement(elements.slice(0, index), element)
    return decision(loaded.version, command, CHAPTER_ELEMENTS_REPLACED, { elements }, { elements }, timestamp)
  })

  runtime.commands.register(RECORD_CHAPTER_MEMORY_COMMAND, async (command, context) => {
    const loaded = await loadActiveChapter(runtime, command, context.session)
    const timestamp = now()
    const memory = createMemory(loaded.state.memory, command, timestamp)
    return decision(loaded.version, command, CHAPTER_MEMORY_RECORDED, { memory }, memory, timestamp)
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: CHAPTER_KNOWLEDGE_PROJECTION,
    mode: 'sync',
    handles: [CHAPTER_ELEMENT_ADDED, CHAPTER_ELEMENT_CHANGED, CHAPTER_ELEMENT_REMOVED, CHAPTER_ELEMENTS_REPLACED, CHAPTER_MEMORY_RECORDED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await deleteProjectRows(transaction, event.aggregateId)
        return
      }
      if (event.eventType === CHAPTER_ELEMENT_ADDED) {
        await transaction.insert(chapterElements).values(readElement(event.payload))
        return
      }
      if (event.eventType === CHAPTER_ELEMENT_CHANGED) {
        const element = readElement(event.payload)
        await transaction.update(chapterElements).set(element).where(and(eq(chapterElements.id, element.id), eq(chapterElements.projectId, element.projectId)))
        return
      }
      if (event.eventType === CHAPTER_ELEMENT_REMOVED) {
        const { element } = readRemovedElement(event.payload)
        await transaction.delete(chapterElements).where(and(eq(chapterElements.id, element.id), eq(chapterElements.projectId, element.projectId)))
        return
      }
      if (event.eventType === CHAPTER_ELEMENTS_REPLACED) {
        const elements = readElements(event.payload)
        await transaction.delete(chapterElements).where(and(eq(chapterElements.projectId, event.projectId!), eq(chapterElements.chapterId, event.aggregateId)))
        if (elements.length)
          await transaction.insert(chapterElements).values(elements)
        return
      }
      const memory = readMemory(event.payload)
      await transaction.insert(chapterMemories).values(memory).onConflictDoUpdate({
        target: [chapterMemories.projectId, chapterMemories.chapterId],
        set: memory,
      })
    },
    reset: deleteProjectRows,
  })
}

async function deleteProjectRows(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  if (projectId) {
    await transaction.delete(chapterElements).where(eq(chapterElements.projectId, projectId))
    await transaction.delete(chapterMemories).where(eq(chapterMemories.projectId, projectId))
    return
  }
  await transaction.delete(chapterElements)
  await transaction.delete(chapterMemories)
}

async function loadActiveChapter(runtime: ChapterKnowledgeEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  if (command.aggregateType !== CHAPTER_KNOWLEDGE_AGGREGATE_TYPE || !command.projectId || command.aggregateId === '')
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Chapter knowledge command has invalid scope')
  const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, {
    aggregateType: CHAPTER_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  })
  if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== command.projectId)
    throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
  return runtime.aggregates.loadInSession(session, chapterKnowledgeAggregate, stream(command))
}

async function createElement(runtime: ChapterKnowledgeEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], command: CommandEnvelope, input: JsonObject, timestamp: string): Promise<ChapterElementSnapshot> {
  const elementType = payloadCodec.enum(input, 'elementType', ELEMENT_TYPES)
  const elementId = payloadCodec.nullableString(input, 'elementId')
  const elementName = await normalizedElementName(runtime, session, command.projectId!, elementType, elementId, payloadCodec.string(input, 'elementName'))
  return {
    id: payloadCodec.string(input, 'id'),
    projectId: command.projectId!,
    chapterId: command.aggregateId,
    elementType,
    elementId,
    elementName,
    relationType: payloadCodec.enum(input, 'relationType', RELATION_TYPES),
    importance: 'importance' in input ? payloadCodec.enum(input, 'importance', IMPORTANCE_LEVELS) : 'normal',
    appearanceOrder: payloadCodec.nullableInteger(input, 'appearanceOrder'),
    notes: payloadCodec.nullableString(input, 'notes'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

async function changeElement(runtime: ChapterKnowledgeEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], current: ChapterElementSnapshot, input: JsonObject, timestamp: string): Promise<ChapterElementSnapshot> {
  const elementType = 'elementType' in input ? payloadCodec.enum(input, 'elementType', ELEMENT_TYPES) : current.elementType
  const elementId = payloadCodec.nextNullableString(input, 'elementId', current.elementId)
  const requestedName = 'elementName' in input ? payloadCodec.string(input, 'elementName') : current.elementName
  const elementName = await normalizedElementName(runtime, session, current.projectId, elementType, elementId, requestedName)
  return {
    ...current,
    elementType,
    elementId,
    elementName,
    relationType: 'relationType' in input ? payloadCodec.enum(input, 'relationType', RELATION_TYPES) : current.relationType,
    importance: 'importance' in input ? payloadCodec.enum(input, 'importance', IMPORTANCE_LEVELS) : current.importance,
    appearanceOrder: 'appearanceOrder' in input ? payloadCodec.nullableInteger(input, 'appearanceOrder') : current.appearanceOrder,
    notes: payloadCodec.nextNullableString(input, 'notes', current.notes),
    updatedAt: timestamp,
  }
}

async function normalizedElementName(runtime: ChapterKnowledgeEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, elementType: ElementType, elementId: string | null, fallback: string): Promise<string> {
  if (elementType !== 'character' || !elementId)
    return fallback.trim()
  const character = await runtime.aggregates.loadInSession(session, characterAggregate, { aggregateType: CHARACTER_AGGREGATE_TYPE, aggregateId: elementId, projectId })
  if (!character.state.exists || character.state.deleted || character.state.projectId !== projectId)
    throw new DomainCommandError('CHARACTER_NOT_FOUND', 'Character not found')
  return character.state.name
}

function assertUniqueElement(existing: ChapterElementSnapshot[], candidate: ChapterElementSnapshot) {
  if (existing.some(element => element.elementType === candidate.elementType && element.elementName === candidate.elementName && element.relationType === candidate.relationType))
    throw new DomainCommandError('CHAPTER_ELEMENT_DUPLICATE', `章节元素重复：${candidate.elementName}`)
}

function createMemory(current: ChapterMemorySnapshot | null, command: CommandEnvelope, timestamp: string): ChapterMemorySnapshot {
  const memory = {
    id: current?.id ?? payloadCodec.string(command.payload, 'id'),
    projectId: command.projectId!,
    chapterId: command.aggregateId,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } as ChapterMemorySnapshot
  for (const field of MEMORY_FIELDS)
    memory[field] = payloadCodec.nextNullableString(command.payload, field, current?.[field] ?? null)
  return memory
}

function readElement(payload: JsonObject): ChapterElementSnapshot {
  const value = 'element' in payload ? payloadCodec.object(payload.element) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    chapterId: payloadCodec.string(value, 'chapterId'),
    elementType: payloadCodec.enum(value, 'elementType', ELEMENT_TYPES),
    elementId: payloadCodec.nullableString(value, 'elementId'),
    elementName: payloadCodec.string(value, 'elementName'),
    relationType: payloadCodec.enum(value, 'relationType', RELATION_TYPES),
    importance: payloadCodec.enum(value, 'importance', IMPORTANCE_LEVELS),
    appearanceOrder: payloadCodec.nullableInteger(value, 'appearanceOrder'),
    notes: payloadCodec.nullableString(value, 'notes'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function readElements(payload: JsonObject): ChapterElementSnapshot[] {
  return payloadCodec.objectArray(payload, 'elements').map(readElement)
}

function readMemory(payload: JsonObject): ChapterMemorySnapshot {
  const value = 'memory' in payload ? payloadCodec.object(payload.memory) : payload
  const memory = {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    chapterId: payloadCodec.string(value, 'chapterId'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  } as ChapterMemorySnapshot
  for (const field of MEMORY_FIELDS)
    memory[field] = payloadCodec.nullableString(value, field)
  return memory
}

function validateElementRemoved(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return { element: readElement(payloadCodec.object(value.element)), removedAt: payloadCodec.string(value, 'removedAt') }
}

function readRemovedElement(payload: JsonObject) {
  const value = validateElementRemoved(payload)
  return { element: readElement(payloadCodec.object(value.element)), removedAt: payloadCodec.string(value, 'removedAt') }
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, eventType: string, payload: JsonObject, result: TResult, occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events: [pendingEvent(eventType, payload, command, occurredAt)] }], result }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  return { aggregateType: CHAPTER_KNOWLEDGE_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}
