import type { ProjectStatus } from '@ai-novel/shared'
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
import { eq } from 'drizzle-orm'
import { novelProjects, projectReadModels } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'

export const PROJECT_AGGREGATE_TYPE = 'Project'
export const PROJECT_PROJECTION = 'project-read-model'

export const CREATE_PROJECT_COMMAND = 'CreateProject'
export const UPDATE_PROJECT_COMMAND = 'UpdateProject'
export const DELETE_PROJECT_COMMAND = 'DeleteProject'

export const PROJECT_CREATED = 'ProjectCreated'
export const PROJECT_DETAILS_CHANGED = 'ProjectDetailsChanged'
export const PROJECT_DELETION_REQUESTED = 'ProjectDeletionRequested'
export const PROJECT_DELETED = 'ProjectDeleted'

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'planning',
  'writing',
  'paused',
  'completed',
  'archived',
]

export type ProjectSnapshot = JsonObject & {
  id: string
  title: string
  description: string | null
  genre: string | null
  theme: string | null
  targetWords: number | null
  targetAudience: string | null
  styleProfile: string | null
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export type ProjectState = ProjectSnapshot & {
  exists: boolean
  deleted: boolean
}

export interface ProjectEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const projectAggregate: AggregateDefinition<ProjectState> = {
  aggregateType: PROJECT_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    id: '',
    title: '',
    description: null,
    genre: null,
    theme: null,
    targetWords: null,
    targetAudience: null,
    styleProfile: null,
    status: 'planning',
    createdAt: '',
    updatedAt: '',
    exists: false,
    deleted: false,
  }),
  evolve: (state, event) => {
    if (event.eventType === PROJECT_CREATED || event.eventType === PROJECT_DETAILS_CHANGED) {
      return {
        ...readProjectEvent(event.payload),
        exists: true,
        deleted: false,
      }
    }
    if (event.eventType === PROJECT_DELETED)
      return { ...state, deleted: true }
    return state
  },
}

export function registerProjectEventing(runtime: ProjectEventingRuntime): void {
  registerEvents(runtime.events)
  registerProjection(runtime.projections)
  registerCommands(runtime)
}

function registerEvents(events: EventRegistry): void {
  for (const eventType of [PROJECT_CREATED, PROJECT_DETAILS_CHANGED]) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: validateProjectEvent,
    })
  }
  for (const eventType of [PROJECT_DELETION_REQUESTED, PROJECT_DELETED]) {
    events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: validateTimestampEvent,
    })
  }
}

function registerCommands(runtime: ProjectEventingRuntime): void {
  runtime.commands.register(CREATE_PROJECT_COMMAND, async (command, context) => {
    const stream = projectStream(command)
    const loaded = await runtime.aggregates.loadInSession(context.session, projectAggregate, stream)
    if (loaded.state.exists)
      throw new DomainCommandError('PROJECT_ALREADY_EXISTS', 'Project already exists')

    const timestamp = now()
    const project = createProjectSnapshot(command, timestamp)
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: [projectEvent(PROJECT_CREATED, project, command, timestamp)],
      }],
      result: project,
    }
  })

  runtime.commands.register(UPDATE_PROJECT_COMMAND, async (command, context) => {
    const stream = projectStream(command)
    const loaded = await runtime.aggregates.loadInSession(context.session, projectAggregate, stream)
    assertActiveProject(loaded.state)
    const timestamp = now()
    const project = updateProjectSnapshot(loaded.state, command.payload, timestamp)
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: [projectEvent(PROJECT_DETAILS_CHANGED, project, command, timestamp)],
      }],
      result: project,
    }
  })

  runtime.commands.register(DELETE_PROJECT_COMMAND, async (command, context) => {
    const stream = projectStream(command)
    const loaded = await runtime.aggregates.loadInSession(context.session, projectAggregate, stream)
    assertActiveProject(loaded.state)
    const timestamp = now()
    return {
      streams: [{
        stream,
        expectedVersion: loaded.version,
        events: [
          timestampEvent(PROJECT_DELETION_REQUESTED, 'requestedAt', command, timestamp),
          timestampEvent(PROJECT_DELETED, 'deletedAt', command, timestamp),
        ],
      }],
      result: projectResult(loaded.state),
    }
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: PROJECT_PROJECTION,
    mode: 'sync',
    handles: [PROJECT_CREATED, PROJECT_DETAILS_CHANGED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_CREATED) {
        const project = readProjectEvent(event.payload)
        await transaction.insert(projectReadModels)
          .values(project)
          .onConflictDoUpdate({
            target: projectReadModels.id,
            set: project,
          })
        await transaction.insert(novelProjects)
          .values(project)
          .onConflictDoUpdate({
            target: novelProjects.id,
            set: project,
          })
        return
      }

      if (event.eventType === PROJECT_DETAILS_CHANGED) {
        const project = readProjectEvent(event.payload)
        await transaction.update(projectReadModels)
          .set(project)
          .where(eq(projectReadModels.id, project.id))
        await transaction.update(novelProjects)
          .set(project)
          .where(eq(novelProjects.id, project.id))
        return
      }

      await transaction.delete(projectReadModels)
        .where(eq(projectReadModels.id, event.aggregateId))
      await transaction.delete(novelProjects)
        .where(eq(novelProjects.id, event.aggregateId))
    },
    reset: async (transaction, projectId) => {
      if (projectId) {
        await transaction.delete(projectReadModels).where(eq(projectReadModels.id, projectId))
        return
      }
      await transaction.delete(projectReadModels)
    },
  })
}

function projectStream(command: CommandEnvelope): StreamRef {
  if (command.aggregateType !== PROJECT_AGGREGATE_TYPE || command.projectId !== command.aggregateId) {
    throw new DomainCommandError(
      'PROJECT_SCOPE_MISMATCH',
      'Project commands must target their own project stream',
    )
  }
  return {
    aggregateType: PROJECT_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  }
}

function createProjectSnapshot(command: CommandEnvelope, timestamp: string): ProjectSnapshot {
  const input = command.payload
  const title = requiredTrimmedString(input, 'title')
  return {
    id: command.aggregateId,
    title,
    description: nullableString(input, 'description'),
    genre: nullableString(input, 'genre'),
    theme: nullableString(input, 'theme'),
    targetWords: nullableNumber(input, 'targetWords'),
    targetAudience: nullableString(input, 'targetAudience'),
    styleProfile: nullableString(input, 'styleProfile'),
    status: projectStatus(input.status ?? 'planning'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function updateProjectSnapshot(
  current: ProjectState,
  input: JsonObject,
  timestamp: string,
): ProjectSnapshot {
  const project = projectResult(current)
  if ('title' in input)
    project.title = requiredTrimmedString(input, 'title')
  if ('description' in input)
    project.description = nullableString(input, 'description')
  if ('genre' in input)
    project.genre = nullableString(input, 'genre')
  if ('theme' in input)
    project.theme = nullableString(input, 'theme')
  if ('targetWords' in input)
    project.targetWords = nullableNumber(input, 'targetWords')
  if ('targetAudience' in input)
    project.targetAudience = nullableString(input, 'targetAudience')
  if ('styleProfile' in input)
    project.styleProfile = nullableString(input, 'styleProfile')
  if ('status' in input)
    project.status = projectStatus(input.status)
  project.updatedAt = timestamp
  return project
}

function projectEvent(
  eventType: string,
  project: ProjectSnapshot,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return {
    eventId: generateId(),
    eventType,
    schemaVersion: 1,
    payload: { project },
    metadata: eventMetadata(command),
    occurredAt,
  }
}

function timestampEvent(
  eventType: string,
  field: string,
  command: CommandEnvelope,
  occurredAt: string,
): PendingEvent {
  return {
    eventId: generateId(),
    eventType,
    schemaVersion: 1,
    payload: { [field]: occurredAt },
    metadata: eventMetadata(command),
    occurredAt,
  }
}

function eventMetadata(command: CommandEnvelope): JsonObject {
  return {
    actorType: 'system',
    projectId: command.projectId,
  }
}

function validateProjectEvent(payload: unknown): JsonObject {
  return { project: readProjectEvent(readObject(payload)) }
}

function validateTimestampEvent(payload: unknown): JsonObject {
  const record = readObject(payload)
  const key = 'requestedAt' in record ? 'requestedAt' : 'deletedAt'
  return { [key]: requiredString(record, key) }
}

function readProjectEvent(payload: JsonObject): ProjectSnapshot {
  const project = 'project' in payload ? readObject(payload.project) : payload
  return {
    id: requiredString(project, 'id'),
    title: requiredTrimmedString(project, 'title'),
    description: nullableString(project, 'description'),
    genre: nullableString(project, 'genre'),
    theme: nullableString(project, 'theme'),
    targetWords: nullableNumber(project, 'targetWords'),
    targetAudience: nullableString(project, 'targetAudience'),
    styleProfile: nullableString(project, 'styleProfile'),
    status: projectStatus(project.status),
    createdAt: requiredString(project, 'createdAt'),
    updatedAt: requiredString(project, 'updatedAt'),
  }
}

function projectResult(state: ProjectState): ProjectSnapshot {
  return {
    id: state.id,
    title: state.title,
    description: state.description,
    genre: state.genre,
    theme: state.theme,
    targetWords: state.targetWords,
    targetAudience: state.targetAudience,
    styleProfile: state.styleProfile,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}

function assertActiveProject(state: ProjectState): void {
  if (!state.exists || state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

function requiredTrimmedString(record: JsonObject, key: string): string {
  const value = requiredString(record, key).trim()
  if (!value)
    throw new DomainCommandError('PROJECT_TITLE_REQUIRED', 'Project title is required')
  return value
}

function requiredString(record: JsonObject, key: string): string {
  const value = record[key]
  if (typeof value !== 'string')
    throw new DomainCommandError('INVALID_PROJECT_PAYLOAD', `${key} must be a string`)
  return value
}

function nullableString(record: JsonObject, key: string): string | null {
  const value = record[key]
  if (value === undefined || value === null)
    return null
  if (typeof value !== 'string')
    throw new DomainCommandError('INVALID_PROJECT_PAYLOAD', `${key} must be a string or null`)
  return value
}

function nullableNumber(record: JsonObject, key: string): number | null {
  const value = record[key]
  if (value === undefined || value === null)
    return null
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new DomainCommandError('INVALID_PROJECT_PAYLOAD', `${key} must be a finite number or null`)
  return value
}

function projectStatus(value: unknown): ProjectStatus {
  if (typeof value !== 'string' || !PROJECT_STATUSES.includes(value as ProjectStatus))
    throw new DomainCommandError('INVALID_PROJECT_STATUS', 'Project status is invalid')
  return value as ProjectStatus
}

function readObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new DomainCommandError('INVALID_PROJECT_PAYLOAD', 'Project payload must be an object')
  return value as JsonObject
}
