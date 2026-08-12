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
import { chapterChangeSetItems, chapterChangeSets } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { PROJECT_AGGREGATE_TYPE, PROJECT_DELETED, projectAggregate } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const CHANGE_SET_AGGREGATE_TYPE = 'ChapterChangeSet'
export const CHANGE_SET_PROJECTION = 'chapter-change-sets'
export const DRAFT_CHANGE_SET_COMMAND = 'DraftChapterChangeSet'
export const CHANGE_CHANGE_SET_COMMAND = 'ChangeChapterChangeSet'
export const CHANGE_CHANGE_SET_ITEM_COMMAND = 'ChangeChapterChangeSetItem'

export const CHANGE_SET_DRAFTED = 'ChapterChangeSetDrafted'
export const CHANGE_SET_CHANGED = 'ChapterChangeSetChanged'
export const CHANGE_SET_ITEM_CHANGED = 'ChapterChangeSetItemChanged'

const CHANGE_SET_STATUSES = ['drafted', 'reviewing', 'approved', 'applied', 'blocked', 'rejected', 'apply_failed'] as const
const ITEM_STATUSES = ['pending', 'approved', 'applied', 'blocked', 'rejected', 'apply_failed'] as const
const ITEM_TYPES = ['draft', 'character_create', 'character_update', 'relationship_create', 'relationship_update', 'conflict_create', 'conflict_update', 'foreshadowing_create', 'foreshadowing_payoff', 'fact_create', 'chapter_memory', 'style_note', 'continuity_note'] as const
const RISK_LEVELS = ['low', 'medium', 'high'] as const
const codec = createPayloadCodec('INVALID_CHANGE_SET', 'Chapter change set payload')

export type ChapterChangeSetSnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  sceneId: string | null
  writingJobId: string | null
  sourceStepId: string | null
  status: typeof CHANGE_SET_STATUSES[number]
  riskLevel: typeof RISK_LEVELS[number]
  riskSummary: string | null
  draftTitle: string | null
  draftContent: string | null
  consistencyReportJson: unknown
  extractedChangesJson: unknown
  applyReportJson: unknown
  beforeSnapshotId: string | null
  afterSnapshotId: string | null
  createdAt: string
  updatedAt: string
  appliedAt: string | null
}

export type ChapterChangeSetItemSnapshot = JsonObject & {
  id: string
  changeSetId: string
  projectId: string
  chapterId: string
  itemType: typeof ITEM_TYPES[number]
  riskLevel: typeof RISK_LEVELS[number]
  title: string
  payloadJson: unknown
  status: typeof ITEM_STATUSES[number]
  applyError: string | null
  createdAt: string
  updatedAt: string
}

interface ChapterChangeSetState extends ChapterChangeSetSnapshot {
  exists: boolean
  items: Record<string, ChapterChangeSetItemSnapshot>
}

export interface ChapterChangeSetEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const chapterChangeSetAggregate: AggregateDefinition<ChapterChangeSetState> = {
  aggregateType: CHANGE_SET_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({ exists: false, id: '', projectId: '', chapterId: '', sceneId: null, writingJobId: null, sourceStepId: null, status: 'drafted', riskLevel: 'medium', riskSummary: null, draftTitle: null, draftContent: null, consistencyReportJson: null, extractedChangesJson: {}, applyReportJson: null, beforeSnapshotId: null, afterSnapshotId: null, createdAt: '', updatedAt: '', appliedAt: null, items: {} }),
  evolve: (state, event) => {
    if (event.eventType === CHANGE_SET_DRAFTED) {
      const changeSet = readChangeSet(event.payload)
      const items = readItems(event.payload)
      return { ...state, ...changeSet, exists: true, items: Object.fromEntries(items.map(item => [item.id, item])) }
    }
    if (event.eventType === CHANGE_SET_CHANGED)
      return { ...state, ...readChangeSet(event.payload) }
    if (event.eventType === CHANGE_SET_ITEM_CHANGED) {
      const item = readItem(event.payload)
      return { ...state, items: { ...state.items, [item.id]: item } }
    }
    return state
  },
}

export function registerChapterChangeSetEventing(runtime: ChapterChangeSetEventingRuntime): void {
  runtime.events.register({ eventType: CHANGE_SET_DRAFTED, currentSchemaVersion: 1, payloadProtection: 'project-content', upcasters: {}, validate: payload => ({ changeSet: readChangeSet(codec.object(payload)), items: readItems(codec.object(payload)) }) })
  runtime.events.register({ eventType: CHANGE_SET_CHANGED, currentSchemaVersion: 1, payloadProtection: 'project-content', upcasters: {}, validate: payload => ({ changeSet: readChangeSet(codec.object(payload)) }) })
  runtime.events.register({ eventType: CHANGE_SET_ITEM_CHANGED, currentSchemaVersion: 1, payloadProtection: 'project-content', upcasters: {}, validate: payload => ({ item: readItem(codec.object(payload)) }) })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: ChapterChangeSetEventingRuntime): void {
  runtime.commands.register(DRAFT_CHANGE_SET_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, chapterChangeSetAggregate, stream(command))
    if (loaded.state.exists)
      throw new DomainCommandError('CHANGE_SET_ALREADY_EXISTS', 'Chapter change set already exists')
    await assertChapterTarget(runtime, context.session, command.projectId!, command.payload)
    const timestamp = now()
    const changeSet = createChangeSet(command, timestamp)
    const items = createItems(command, changeSet, timestamp)
    return decision(loaded.version, command, CHANGE_SET_DRAFTED, { changeSet, items }, { ...changeSet, items }, timestamp)
  })
  runtime.commands.register(CHANGE_CHANGE_SET_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const timestamp = now()
    const changeSet = changeChangeSet(loaded.state, command.payload, timestamp)
    return decision(loaded.version, command, CHANGE_SET_CHANGED, { changeSet }, changeSet, timestamp)
  })
  runtime.commands.register(CHANGE_CHANGE_SET_ITEM_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = codec.string(command.payload, 'id')
    const current = loaded.state.items[id]
    if (!current)
      throw new DomainCommandError('CHANGE_SET_ITEM_NOT_FOUND', 'Chapter change set item not found')
    const timestamp = now()
    const item = changeItem(current, command.payload, timestamp)
    return decision(loaded.version, command, CHANGE_SET_ITEM_CHANGED, { item }, item, timestamp)
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: CHANGE_SET_PROJECTION,
    mode: 'sync',
    handles: [CHANGE_SET_DRAFTED, CHANGE_SET_CHANGED, CHANGE_SET_ITEM_CHANGED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await resetProjection(transaction, event.aggregateId)
        return
      }
      if (event.eventType === CHANGE_SET_DRAFTED) {
        await transaction.insert(chapterChangeSets).values(readChangeSet(event.payload))
        const items = readItems(event.payload)
        if (items.length)
          await transaction.insert(chapterChangeSetItems).values(items)
        return
      }
      if (event.eventType === CHANGE_SET_CHANGED) {
        const changeSet = readChangeSet(event.payload)
        await transaction.update(chapterChangeSets).set(changeSet).where(and(eq(chapterChangeSets.id, changeSet.id), eq(chapterChangeSets.projectId, changeSet.projectId)))
        return
      }
      const item = readItem(event.payload)
      await transaction.update(chapterChangeSetItems).set(item).where(and(eq(chapterChangeSetItems.id, item.id), eq(chapterChangeSetItems.projectId, item.projectId)))
    },
    reset: resetProjection,
  })
}

async function resetProjection(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  if (projectId) {
    await transaction.delete(chapterChangeSetItems).where(eq(chapterChangeSetItems.projectId, projectId))
    await transaction.delete(chapterChangeSets).where(eq(chapterChangeSets.projectId, projectId))
    return
  }
  await transaction.delete(chapterChangeSetItems)
  await transaction.delete(chapterChangeSets)
}

async function assertActiveProject(runtime: ChapterChangeSetEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  if (!command.projectId || command.aggregateType !== CHANGE_SET_AGGREGATE_TYPE)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Chapter change set command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, { aggregateType: PROJECT_AGGREGATE_TYPE, aggregateId: command.projectId, projectId: command.projectId })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function assertChapterTarget(runtime: ChapterChangeSetEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, payload: JsonObject) {
  const chapterId = codec.string(payload, 'chapterId')
  const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, { aggregateType: CHAPTER_AGGREGATE_TYPE, aggregateId: chapterId, projectId })
  if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
    throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
  const sceneId = codec.nullableString(payload, 'sceneId')
  if (sceneId && (!chapter.state.scenes[sceneId] || chapter.state.scenes[sceneId].deleted))
    throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
}

async function loadActive(runtime: ChapterChangeSetEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(session, chapterChangeSetAggregate, stream(command))
  if (!loaded.state.exists)
    throw new DomainCommandError('CHANGE_SET_NOT_FOUND', 'Chapter change set not found')
  return loaded
}

function createChangeSet(command: CommandEnvelope, timestamp: string): ChapterChangeSetSnapshot {
  return { id: command.aggregateId, projectId: command.projectId!, chapterId: codec.string(command.payload, 'chapterId'), sceneId: codec.nullableString(command.payload, 'sceneId'), writingJobId: codec.nullableString(command.payload, 'writingJobId'), sourceStepId: codec.nullableString(command.payload, 'sourceStepId'), status: 'drafted', riskLevel: codec.enum(command.payload, 'riskLevel', RISK_LEVELS), riskSummary: codec.nullableString(command.payload, 'riskSummary'), draftTitle: codec.nullableString(command.payload, 'draftTitle'), draftContent: codec.nullableString(command.payload, 'draftContent'), consistencyReportJson: command.payload.consistencyReportJson ?? null, extractedChangesJson: command.payload.extractedChangesJson ?? {}, applyReportJson: null, beforeSnapshotId: null, afterSnapshotId: null, createdAt: timestamp, updatedAt: timestamp, appliedAt: null }
}

function createItems(command: CommandEnvelope, changeSet: ChapterChangeSetSnapshot, timestamp: string): ChapterChangeSetItemSnapshot[] {
  const seen = new Set<string>()
  return codec.objectArray(command.payload, 'items').map((input) => {
    const id = codec.string(input, 'id')
    if (seen.has(id))
      throw new DomainCommandError('DUPLICATE_CHANGE_SET_ITEM', 'Chapter change set item ids must be unique')
    seen.add(id)
    return { id, changeSetId: command.aggregateId, projectId: command.projectId!, chapterId: changeSet.chapterId, itemType: codec.enum(input, 'itemType', ITEM_TYPES), riskLevel: codec.enum(input, 'riskLevel', RISK_LEVELS), title: codec.string(input, 'title'), payloadJson: input.payloadJson ?? {}, status: 'pending', applyError: null, createdAt: timestamp, updatedAt: timestamp }
  })
}

function changeChangeSet(current: ChapterChangeSetSnapshot, payload: JsonObject, timestamp: string): ChapterChangeSetSnapshot {
  const status = 'status' in payload ? codec.enum(payload, 'status', CHANGE_SET_STATUSES) : current.status
  assertChangeSetTransition(current.status, status)
  return { ...current, status, applyReportJson: 'applyReportJson' in payload ? payload.applyReportJson : current.applyReportJson, beforeSnapshotId: codec.nextNullableString(payload, 'beforeSnapshotId', current.beforeSnapshotId), afterSnapshotId: codec.nextNullableString(payload, 'afterSnapshotId', current.afterSnapshotId), appliedAt: codec.nextNullableString(payload, 'appliedAt', current.appliedAt), updatedAt: timestamp }
}

function changeItem(current: ChapterChangeSetItemSnapshot, payload: JsonObject, timestamp: string): ChapterChangeSetItemSnapshot {
  const status = 'status' in payload ? codec.enum(payload, 'status', ITEM_STATUSES) : current.status
  assertItemTransition(current.status, status)
  return { ...current, status, applyError: codec.nextNullableString(payload, 'applyError', current.applyError), updatedAt: timestamp }
}

function assertChangeSetTransition(current: ChapterChangeSetSnapshot['status'], next: ChapterChangeSetSnapshot['status']) {
  if (current === next)
    return
  const allowed: Record<ChapterChangeSetSnapshot['status'], ChapterChangeSetSnapshot['status'][]> = {
    drafted: ['reviewing', 'approved', 'blocked', 'rejected', 'apply_failed'],
    reviewing: ['approved', 'blocked', 'rejected', 'apply_failed'],
    approved: ['applied', 'apply_failed', 'rejected'],
    applied: [],
    blocked: ['reviewing', 'approved', 'rejected'],
    rejected: [],
    apply_failed: ['approved', 'rejected'],
  }
  if (!allowed[current].includes(next))
    throw new DomainCommandError('INVALID_CHANGE_SET_TRANSITION', `Cannot transition change set from ${current} to ${next}`)
}

function assertItemTransition(current: ChapterChangeSetItemSnapshot['status'], next: ChapterChangeSetItemSnapshot['status']) {
  if (current === next)
    return
  if (next === 'applied' && current !== 'approved')
    throw new DomainCommandError('CHANGE_SET_ITEM_NOT_APPROVED', 'Only approved change set items can be applied')
  const allowed: Record<ChapterChangeSetItemSnapshot['status'], ChapterChangeSetItemSnapshot['status'][]> = {
    pending: ['approved', 'blocked', 'rejected'],
    approved: ['applied', 'apply_failed', 'rejected'],
    applied: [],
    blocked: ['approved', 'rejected'],
    rejected: [],
    apply_failed: ['approved', 'rejected'],
  }
  if (!allowed[current].includes(next))
    throw new DomainCommandError('INVALID_CHANGE_SET_ITEM_TRANSITION', `Cannot transition change set item from ${current} to ${next}`)
}

function readChangeSet(payload: JsonObject): ChapterChangeSetSnapshot {
  const v = 'changeSet' in payload ? codec.object(payload.changeSet) : payload
  return { id: codec.string(v, 'id'), projectId: codec.string(v, 'projectId'), chapterId: codec.string(v, 'chapterId'), sceneId: codec.nullableString(v, 'sceneId'), writingJobId: codec.nullableString(v, 'writingJobId'), sourceStepId: codec.nullableString(v, 'sourceStepId'), status: codec.enum(v, 'status', CHANGE_SET_STATUSES), riskLevel: codec.enum(v, 'riskLevel', RISK_LEVELS), riskSummary: codec.nullableString(v, 'riskSummary'), draftTitle: codec.nullableString(v, 'draftTitle'), draftContent: codec.nullableString(v, 'draftContent'), consistencyReportJson: v.consistencyReportJson ?? null, extractedChangesJson: v.extractedChangesJson ?? {}, applyReportJson: v.applyReportJson ?? null, beforeSnapshotId: codec.nullableString(v, 'beforeSnapshotId'), afterSnapshotId: codec.nullableString(v, 'afterSnapshotId'), createdAt: codec.string(v, 'createdAt'), updatedAt: codec.string(v, 'updatedAt'), appliedAt: codec.nullableString(v, 'appliedAt') }
}

function readItems(payload: JsonObject): ChapterChangeSetItemSnapshot[] {
  return codec.objectArray(payload, 'items').map(readItem)
}

function readItem(payload: JsonObject): ChapterChangeSetItemSnapshot {
  const v = 'item' in payload ? codec.object(payload.item) : payload
  return { id: codec.string(v, 'id'), changeSetId: codec.string(v, 'changeSetId'), projectId: codec.string(v, 'projectId'), chapterId: codec.string(v, 'chapterId'), itemType: codec.enum(v, 'itemType', ITEM_TYPES), riskLevel: codec.enum(v, 'riskLevel', RISK_LEVELS), title: codec.string(v, 'title'), payloadJson: v.payloadJson ?? {}, status: codec.enum(v, 'status', ITEM_STATUSES), applyError: codec.nullableString(v, 'applyError'), createdAt: codec.string(v, 'createdAt'), updatedAt: codec.string(v, 'updatedAt') }
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, eventType: string, payload: JsonObject, result: TResult, occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events: [pendingEvent(eventType, payload, command, occurredAt)] }], result }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  return { aggregateType: CHANGE_SET_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}
