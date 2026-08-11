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
import {
  acts,
  projectAppliedTemplates,
  storyBibles,
  storyStructureTemplates,
  volumes,
} from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import {
  PROJECT_AGGREGATE_TYPE,
  PROJECT_DELETED,
  projectAggregate,
} from '../project/project.eventing'

export const STORY_STRUCTURE_AGGREGATE_TYPE = 'StoryStructure'
export const STORY_STRUCTURE_PROJECTION = 'story-structure'

export const CREATE_STORY_BIBLE_COMMAND = 'CreateStoryBible'
export const CHANGE_STORY_BIBLE_COMMAND = 'ChangeStoryBible'
export const CREATE_VOLUME_COMMAND = 'CreateVolume'
export const CHANGE_VOLUME_COMMAND = 'ChangeVolume'
export const DELETE_VOLUME_COMMAND = 'DeleteVolume'
export const CREATE_ACT_COMMAND = 'CreateAct'
export const CHANGE_ACT_COMMAND = 'ChangeAct'
export const DELETE_ACT_COMMAND = 'DeleteAct'
export const APPLY_STRUCTURE_TEMPLATE_COMMAND = 'ApplyStructureTemplate'

export const STORY_BIBLE_CHANGED = 'StoryBibleChanged'
export const VOLUME_CREATED = 'VolumeCreated'
export const VOLUME_CHANGED = 'VolumeChanged'
export const VOLUME_DELETED = 'VolumeDeleted'
export const ACT_CREATED = 'ActCreated'
export const ACT_CHANGED = 'ActChanged'
export const ACT_DELETED = 'ActDeleted'
export const STRUCTURE_TEMPLATE_APPLIED = 'StructureTemplateApplied'

const payloadCodec = createPayloadCodec('INVALID_STORY_STRUCTURE', 'Story structure payload')

export type StoryBibleSnapshot = JsonObject & {
  id: string
  projectId: string
  worldview: string | null
  mainConflict: string | null
  theme: string | null
  rules: string | null
  timeline: string | null
  createdAt: string
  updatedAt: string
}

export type VolumeSnapshot = JsonObject & {
  id: string
  projectId: string
  title: string
  summary: string | null
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export type ActSnapshot = JsonObject & {
  id: string
  projectId: string
  volumeId: string | null
  title: string
  description: string | null
  theme: string | null
  keyEvents: string | null
  targetChapterCount: number | null
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export type StoryStructureState = JsonObject & {
  projectId: string
  storyBible: StoryBibleSnapshot | null
  volumes: Record<string, VolumeSnapshot>
  acts: Record<string, ActSnapshot>
}

export interface StoryStructureEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const storyStructureAggregate: AggregateDefinition<StoryStructureState> = {
  aggregateType: STORY_STRUCTURE_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    projectId: '',
    storyBible: null,
    volumes: {},
    acts: {},
  }),
  evolve: (state, event) => {
    if (event.eventType === STORY_BIBLE_CHANGED) {
      const storyBible = readStoryBibleEvent(event.payload)
      return { ...state, projectId: storyBible.projectId, storyBible }
    }
    if (event.eventType === VOLUME_CREATED || event.eventType === VOLUME_CHANGED) {
      const volume = readVolumeEvent(event.payload)
      return {
        ...state,
        projectId: volume.projectId,
        volumes: { ...state.volumes, [volume.id]: volume },
      }
    }
    if (event.eventType === VOLUME_DELETED) {
      const id = requiredString(readObject(event.payload), 'id')
      const nextVolumes = { ...state.volumes }
      delete nextVolumes[id]
      return {
        ...state,
        volumes: nextVolumes,
        acts: Object.fromEntries(Object.entries(state.acts).map(([actId, act]) => [
          actId,
          act.volumeId === id ? { ...act, volumeId: null } : act,
        ])),
      }
    }
    if (event.eventType === ACT_CREATED || event.eventType === ACT_CHANGED) {
      const act = readActEvent(event.payload)
      return {
        ...state,
        projectId: act.projectId,
        acts: { ...state.acts, [act.id]: act },
      }
    }
    if (event.eventType === ACT_DELETED) {
      const id = requiredString(readObject(event.payload), 'id')
      const nextActs = { ...state.acts }
      delete nextActs[id]
      return { ...state, acts: nextActs }
    }
    return state
  },
}

export function registerStoryStructureEventing(runtime: StoryStructureEventingRuntime): void {
  registerEvents(runtime.events)
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerEvents(events: EventRegistry): void {
  events.register({
    eventType: STORY_BIBLE_CHANGED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: payload => ({ storyBible: readStoryBibleEvent(readObject(payload)) }),
  })
  for (const eventType of [VOLUME_CREATED, VOLUME_CHANGED]) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: payload => ({ volume: readVolumeEvent(readObject(payload)) }),
    })
  }
  for (const eventType of [ACT_CREATED, ACT_CHANGED]) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: payload => ({ act: readActEvent(readObject(payload)) }),
    })
  }
  for (const eventType of [VOLUME_DELETED, ACT_DELETED]) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: validateDeletedEvent,
    })
  }
  events.register({
    eventType: STRUCTURE_TEMPLATE_APPLIED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateTemplateAppliedEvent,
  })
}

function registerCommands(runtime: StoryStructureEventingRuntime): void {
  runtime.commands.register(CREATE_STORY_BIBLE_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    if (loaded.state.storyBible)
      throw new DomainCommandError('STORY_BIBLE_ALREADY_EXISTS', 'Story bible already exists')
    const timestamp = now()
    const storyBible = createStoryBibleSnapshot(command, timestamp)
    return singleEventDecision(loaded.version, structureStream(command), command, STORY_BIBLE_CHANGED, { storyBible }, storyBible, timestamp)
  })

  runtime.commands.register(CHANGE_STORY_BIBLE_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    if (!loaded.state.storyBible)
      throw new DomainCommandError('STORY_BIBLE_NOT_FOUND', 'Story bible not found')
    const timestamp = now()
    const storyBible = changeStoryBibleSnapshot(loaded.state.storyBible, command.payload, timestamp)
    return singleEventDecision(loaded.version, structureStream(command), command, STORY_BIBLE_CHANGED, { storyBible }, storyBible, timestamp)
  })

  runtime.commands.register(CREATE_VOLUME_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    if (loaded.state.volumes[id])
      throw new DomainCommandError('VOLUME_ALREADY_EXISTS', 'Volume already exists')
    const timestamp = now()
    const volume = createVolumeSnapshot(command, timestamp)
    return singleEventDecision(loaded.version, structureStream(command), command, VOLUME_CREATED, { volume }, volume, timestamp)
  })

  runtime.commands.register(CHANGE_VOLUME_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    const current = loaded.state.volumes[id]
    if (!current)
      throw new DomainCommandError('VOLUME_NOT_FOUND', 'Volume not found')
    const timestamp = now()
    const volume = changeVolumeSnapshot(current, command.payload, timestamp)
    return singleEventDecision(loaded.version, structureStream(command), command, VOLUME_CHANGED, { volume }, volume, timestamp)
  })

  runtime.commands.register(DELETE_VOLUME_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    const current = loaded.state.volumes[id]
    if (!current)
      throw new DomainCommandError('VOLUME_NOT_FOUND', 'Volume not found')
    const timestamp = now()
    return singleEventDecision(loaded.version, structureStream(command), command, VOLUME_DELETED, { id, deletedAt: timestamp }, current, timestamp)
  })

  runtime.commands.register(CREATE_ACT_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    if (loaded.state.acts[id])
      throw new DomainCommandError('ACT_ALREADY_EXISTS', 'Act already exists')
    assertVolumeExists(loaded.state, nullableString(command.payload, 'volumeId'))
    const timestamp = now()
    const act = createActSnapshot(command, timestamp)
    return singleEventDecision(loaded.version, structureStream(command), command, ACT_CREATED, { act }, act, timestamp)
  })

  runtime.commands.register(CHANGE_ACT_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    const current = loaded.state.acts[id]
    if (!current)
      throw new DomainCommandError('ACT_NOT_FOUND', 'Act not found')
    const volumeId = 'volumeId' in command.payload
      ? nullableString(command.payload, 'volumeId')
      : current.volumeId
    assertVolumeExists(loaded.state, volumeId)
    const timestamp = now()
    const act = changeActSnapshot(current, command.payload, timestamp)
    return singleEventDecision(loaded.version, structureStream(command), command, ACT_CHANGED, { act }, act, timestamp)
  })

  runtime.commands.register(DELETE_ACT_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    const id = requiredString(command.payload, 'id')
    const current = loaded.state.acts[id]
    if (!current)
      throw new DomainCommandError('ACT_NOT_FOUND', 'Act not found')
    const timestamp = now()
    return singleEventDecision(loaded.version, structureStream(command), command, ACT_DELETED, { id, deletedAt: timestamp }, current, timestamp)
  })

  runtime.commands.register(APPLY_STRUCTURE_TEMPLATE_COMMAND, async (command, context) => {
    const loaded = await loadActiveStructure(runtime, command, context.session)
    const templateId = requiredString(command.payload, 'templateId')
    const [template] = await context.session.transaction.select()
      .from(storyStructureTemplates)
      .where(eq(storyStructureTemplates.id, templateId))
      .limit(1)
    if (!template)
      throw new DomainCommandError('STRUCTURE_TEMPLATE_NOT_FOUND', '模板不存在')

    const definitions = parseActDefinitions(template.actsJson)
    const actIds = 'actIds' in command.payload
      ? stringArray(command.payload, 'actIds')
      : definitions.map(() => generateId())
    if (actIds.length !== definitions.length)
      throw new DomainCommandError('INVALID_STRUCTURE_TEMPLATE_COMMAND', 'actIds must match template acts')
    if (new Set(actIds).size !== actIds.length || actIds.some(id => loaded.state.acts[id]))
      throw new DomainCommandError('ACT_ALREADY_EXISTS', 'Template act IDs must be unique')

    const timestamp = now()
    const pendingEvents: PendingEvent[] = []
    const existingVolume = Object.values(loaded.state.volumes)
      .sort((left, right) => left.orderIndex - right.orderIndex)[0]
    let volumeId = existingVolume?.id
    if (!volumeId) {
      volumeId = 'volumeId' in command.payload
        ? requiredString(command.payload, 'volumeId')
        : generateId()
      const volume = createVolumeSnapshot({
        ...command,
        payload: { id: volumeId, title: '第一卷', orderIndex: 1 },
      }, timestamp)
      pendingEvents.push(pendingEvent(VOLUME_CREATED, { volume }, command, timestamp))
    }

    definitions.forEach((definition, index) => {
      const act = createActSnapshot({
        ...command,
        payload: {
          id: actIds[index],
          volumeId,
          title: definition.title,
          description: definition.description,
          theme: definition.theme,
          keyEvents: definition.keyEvents,
          targetChapterCount: definition.targetChapterCount,
          orderIndex: index + 1,
        },
      }, timestamp)
      pendingEvents.push(pendingEvent(ACT_CREATED, { act }, command, timestamp))
    })
    pendingEvents.push(pendingEvent(STRUCTURE_TEMPLATE_APPLIED, {
      application: {
        id: generateId(),
        projectId: command.projectId,
        templateId,
        appliedAt: timestamp,
        status: 'applied',
      },
    }, command, timestamp))

    return {
      streams: [{
        stream: structureStream(command),
        expectedVersion: loaded.version,
        events: pendingEvents,
      }],
      result: { actIds },
    }
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: STORY_STRUCTURE_PROJECTION,
    mode: 'sync',
    handles: [
      STORY_BIBLE_CHANGED,
      VOLUME_CREATED,
      VOLUME_CHANGED,
      VOLUME_DELETED,
      ACT_CREATED,
      ACT_CHANGED,
      ACT_DELETED,
      STRUCTURE_TEMPLATE_APPLIED,
      PROJECT_DELETED,
    ],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await deleteProjectStructure(transaction, event.aggregateId)
        return
      }
      if (event.eventType === STORY_BIBLE_CHANGED) {
        const storyBible = readStoryBibleEvent(event.payload)
        await transaction.insert(storyBibles).values(storyBible).onConflictDoUpdate({
          target: storyBibles.id,
          set: storyBible,
        })
        return
      }
      if (event.eventType === VOLUME_CREATED || event.eventType === VOLUME_CHANGED) {
        const volume = readVolumeEvent(event.payload)
        await transaction.insert(volumes).values(volume).onConflictDoUpdate({
          target: volumes.id,
          set: volume,
        })
        return
      }
      if (event.eventType === VOLUME_DELETED) {
        const id = requiredString(event.payload, 'id')
        await transaction.update(acts).set({ volumeId: null }).where(and(
          eq(acts.projectId, event.projectId!),
          eq(acts.volumeId, id),
        ))
        await transaction.delete(volumes).where(and(
          eq(volumes.projectId, event.projectId!),
          eq(volumes.id, id),
        ))
        return
      }
      if (event.eventType === ACT_CREATED || event.eventType === ACT_CHANGED) {
        const act = readActEvent(event.payload)
        await transaction.insert(acts).values(act).onConflictDoUpdate({
          target: acts.id,
          set: act,
        })
        return
      }
      if (event.eventType === ACT_DELETED) {
        await transaction.delete(acts).where(and(
          eq(acts.projectId, event.projectId!),
          eq(acts.id, requiredString(event.payload, 'id')),
        ))
        return
      }
      const application = readTemplateApplication(event.payload)
      await transaction.insert(projectAppliedTemplates).values(application).onConflictDoUpdate({
        target: projectAppliedTemplates.id,
        set: application,
      })
    },
    reset: deleteProjectStructure,
  })
}

async function loadActiveStructure(
  runtime: StoryStructureEventingRuntime,
  command: CommandEnvelope,
  session: Parameters<AggregateRepository['loadInSession']>[0],
) {
  const stream = structureStream(command)
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, {
    aggregateType: PROJECT_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
  return runtime.aggregates.loadInSession(session, storyStructureAggregate, stream)
}

function structureStream(command: CommandEnvelope): StreamRef {
  if (
    command.aggregateType !== STORY_STRUCTURE_AGGREGATE_TYPE
    || !command.projectId
    || command.projectId !== command.aggregateId
  ) {
    throw new DomainCommandError(
      'PROJECT_SCOPE_MISMATCH',
      'Story structure commands must target their owning project',
    )
  }
  return {
    aggregateType: STORY_STRUCTURE_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  }
}

function singleEventDecision<TResult extends JsonObject>(
  expectedVersion: number,
  stream: StreamRef,
  command: CommandEnvelope,
  eventType: string,
  payload: JsonObject,
  result: TResult,
  occurredAt: string,
) {
  return {
    streams: [{
      stream,
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

function createStoryBibleSnapshot(command: CommandEnvelope, timestamp: string): StoryBibleSnapshot {
  return {
    id: requiredString(command.payload, 'id'),
    projectId: command.projectId!,
    worldview: nullableString(command.payload, 'worldview'),
    mainConflict: nullableString(command.payload, 'mainConflict'),
    theme: nullableString(command.payload, 'theme'),
    rules: nullableString(command.payload, 'rules'),
    timeline: nullableString(command.payload, 'timeline'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeStoryBibleSnapshot(
  current: StoryBibleSnapshot,
  input: JsonObject,
  timestamp: string,
): StoryBibleSnapshot {
  return {
    ...current,
    worldview: optionalNullableString(input, 'worldview', current.worldview),
    mainConflict: optionalNullableString(input, 'mainConflict', current.mainConflict),
    theme: optionalNullableString(input, 'theme', current.theme),
    rules: optionalNullableString(input, 'rules', current.rules),
    timeline: optionalNullableString(input, 'timeline', current.timeline),
    updatedAt: timestamp,
  }
}

function createVolumeSnapshot(command: CommandEnvelope, timestamp: string): VolumeSnapshot {
  return {
    id: requiredString(command.payload, 'id'),
    projectId: command.projectId!,
    title: requiredString(command.payload, 'title'),
    summary: nullableString(command.payload, 'summary'),
    orderIndex: requiredInteger(command.payload, 'orderIndex', 0),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeVolumeSnapshot(
  current: VolumeSnapshot,
  input: JsonObject,
  timestamp: string,
): VolumeSnapshot {
  return {
    ...current,
    title: 'title' in input ? requiredString(input, 'title') : current.title,
    summary: optionalNullableString(input, 'summary', current.summary),
    orderIndex: 'orderIndex' in input
      ? requiredInteger(input, 'orderIndex', 0)
      : current.orderIndex,
    updatedAt: timestamp,
  }
}

function createActSnapshot(command: CommandEnvelope, timestamp: string): ActSnapshot {
  return {
    id: requiredString(command.payload, 'id'),
    projectId: command.projectId!,
    volumeId: nullableString(command.payload, 'volumeId'),
    title: requiredString(command.payload, 'title'),
    description: nullableString(command.payload, 'description'),
    theme: nullableString(command.payload, 'theme'),
    keyEvents: normalizeText(command.payload, 'keyEvents'),
    targetChapterCount: nullableInteger(command.payload, 'targetChapterCount', 1),
    orderIndex: requiredInteger(command.payload, 'orderIndex', 0),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeActSnapshot(
  current: ActSnapshot,
  input: JsonObject,
  timestamp: string,
): ActSnapshot {
  return {
    ...current,
    volumeId: 'volumeId' in input ? nullableString(input, 'volumeId') : current.volumeId,
    title: 'title' in input ? requiredString(input, 'title') : current.title,
    description: optionalNullableString(input, 'description', current.description),
    theme: optionalNullableString(input, 'theme', current.theme),
    keyEvents: 'keyEvents' in input ? normalizeText(input, 'keyEvents') : current.keyEvents,
    targetChapterCount: 'targetChapterCount' in input
      ? nullableInteger(input, 'targetChapterCount', 1)
      : current.targetChapterCount,
    orderIndex: 'orderIndex' in input
      ? requiredInteger(input, 'orderIndex', 0)
      : current.orderIndex,
    updatedAt: timestamp,
  }
}

function readStoryBibleEvent(payload: JsonObject): StoryBibleSnapshot {
  const value = 'storyBible' in payload ? readObject(payload.storyBible) : payload
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    worldview: nullableString(value, 'worldview'),
    mainConflict: nullableString(value, 'mainConflict'),
    theme: nullableString(value, 'theme'),
    rules: nullableString(value, 'rules'),
    timeline: nullableString(value, 'timeline'),
    createdAt: requiredString(value, 'createdAt'),
    updatedAt: requiredString(value, 'updatedAt'),
  }
}

function readVolumeEvent(payload: JsonObject): VolumeSnapshot {
  const value = 'volume' in payload ? readObject(payload.volume) : payload
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    title: requiredString(value, 'title'),
    summary: nullableString(value, 'summary'),
    orderIndex: requiredInteger(value, 'orderIndex', 0),
    createdAt: requiredString(value, 'createdAt'),
    updatedAt: requiredString(value, 'updatedAt'),
  }
}

function readActEvent(payload: JsonObject): ActSnapshot {
  const value = 'act' in payload ? readObject(payload.act) : payload
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    volumeId: nullableString(value, 'volumeId'),
    title: requiredString(value, 'title'),
    description: nullableString(value, 'description'),
    theme: nullableString(value, 'theme'),
    keyEvents: normalizeText(value, 'keyEvents'),
    targetChapterCount: nullableInteger(value, 'targetChapterCount', 1),
    orderIndex: requiredInteger(value, 'orderIndex', 0),
    createdAt: requiredString(value, 'createdAt'),
    updatedAt: requiredString(value, 'updatedAt'),
  }
}

function validateDeletedEvent(payload: unknown): JsonObject {
  const value = readObject(payload)
  return {
    id: requiredString(value, 'id'),
    deletedAt: requiredString(value, 'deletedAt'),
  }
}

function validateTemplateAppliedEvent(payload: unknown): JsonObject {
  return { application: readTemplateApplication(readObject(payload)) }
}

function readTemplateApplication(payload: JsonObject) {
  const value = 'application' in payload ? readObject(payload.application) : payload
  const status = requiredString(value, 'status')
  if (status !== 'applied' && status !== 'modified')
    throw new DomainCommandError('INVALID_STRUCTURE_EVENT', 'Invalid template application status')
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    templateId: requiredString(value, 'templateId'),
    appliedAt: requiredString(value, 'appliedAt'),
    status: status as 'applied' | 'modified',
  }
}

interface ActDefinition {
  title: string
  description: string | null
  theme: string | null
  keyEvents: string | null
  targetChapterCount: number | null
}

function parseActDefinitions(value: string | null): ActDefinition[] {
  if (!value)
    return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  }
  catch {
    throw new DomainCommandError('INVALID_STRUCTURE_TEMPLATE', '模板幕定义不是有效 JSON')
  }
  if (!Array.isArray(parsed))
    throw new DomainCommandError('INVALID_STRUCTURE_TEMPLATE', '模板幕定义必须是数组')
  return parsed.map((item) => {
    const definition = readObject(item)
    return {
      title: requiredString(definition, 'title'),
      description: nullableString(definition, 'description'),
      theme: nullableString(definition, 'theme'),
      keyEvents: normalizeText(definition, 'keyEvents'),
      targetChapterCount: nullableInteger(definition, 'targetChapterCount', 1),
    }
  })
}

function assertVolumeExists(state: StoryStructureState, volumeId: string | null): void {
  if (volumeId && !state.volumes[volumeId])
    throw new DomainCommandError('VOLUME_NOT_FOUND', 'Volume not found')
}

async function deleteProjectStructure(
  transaction: Parameters<ProjectionRegistry['projectSync']>[0],
  projectId?: string,
): Promise<void> {
  if (projectId) {
    await transaction.delete(projectAppliedTemplates).where(eq(projectAppliedTemplates.projectId, projectId))
    await transaction.delete(acts).where(eq(acts.projectId, projectId))
    await transaction.delete(volumes).where(eq(volumes.projectId, projectId))
    await transaction.delete(storyBibles).where(eq(storyBibles.projectId, projectId))
    return
  }
  await transaction.delete(projectAppliedTemplates)
  await transaction.delete(acts)
  await transaction.delete(volumes)
  await transaction.delete(storyBibles)
}

function requiredString(record: JsonObject, key: string): string {
  return payloadCodec.string(record, key)
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
  return payloadCodec.nullableInteger(record, key, { minimum })
}

function normalizeText(record: JsonObject, key: string): string | null {
  const value = record[key]
  if (value === undefined || value === null)
    return null
  if (typeof value === 'string')
    return value
  if (Array.isArray(value))
    return JSON.stringify(value)
  throw new DomainCommandError('INVALID_STORY_STRUCTURE', `${key} must be text, an array, or null`)
}

function stringArray(record: JsonObject, key: string): string[] {
  return payloadCodec.stringArray(record, key)
}

function readObject(value: unknown): JsonObject {
  return payloadCodec.object(value)
}
