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
import { projectAISettings } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { deleteProjectCredentials } from '../../security/credential-vault'
import { generateId, now } from '../../shared/utils'
import {
  PROJECT_AGGREGATE_TYPE,
  PROJECT_DELETED,
  projectAggregate,
} from '../project/project.eventing'

export const PROJECT_SETTINGS_AGGREGATE_TYPE = 'ProjectSettings'
export const PROJECT_AI_SETTINGS_PROJECTION = 'project-ai-settings'
export const CHANGE_PROJECT_AI_SETTINGS_COMMAND = 'ChangeProjectAISettings'

const AI_PROVIDER_SELECTED = 'AIProviderSelected'
const CREDENTIAL_REFERENCE_CHANGED = 'CredentialReferenceChanged'
const PROJECT_SETTINGS_CHANGED = 'ProjectSettingsChanged'

const payloadCodec = createPayloadCodec('INVALID_PROJECT_SETTINGS', 'Settings payload')

export type ProjectAISettingsSnapshot = JsonObject & {
  projectId: string
  provider: string
  baseUrl: string
  model: string
  temperature: number
  credentialRef: string | null
  credentialSuffix: string | null
  embeddingProvider: string
  embeddingBaseUrl: string
  embeddingModel: string
  embeddingCredentialRef: string | null
  embeddingCredentialSuffix: string | null
  embeddingEnabled: boolean
  createdAt: string
  updatedAt: string
}

type ProjectSettingsState = ProjectAISettingsSnapshot & { exists: boolean }

export interface ProjectSettingsEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

const projectSettingsAggregate: AggregateDefinition<ProjectSettingsState> = {
  aggregateType: PROJECT_SETTINGS_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    projectId: '',
    provider: '',
    baseUrl: '',
    model: '',
    temperature: 70,
    credentialRef: null,
    credentialSuffix: null,
    embeddingProvider: '',
    embeddingBaseUrl: '',
    embeddingModel: '',
    embeddingCredentialRef: null,
    embeddingCredentialSuffix: null,
    embeddingEnabled: true,
    createdAt: '',
    updatedAt: '',
    exists: false,
  }),
  evolve: (state, event) => {
    if (event.eventType !== PROJECT_SETTINGS_CHANGED)
      return state
    return { ...readSettingsEvent(event.payload), exists: true }
  },
}

export function registerProjectSettingsEventing(runtime: ProjectSettingsEventingRuntime): void {
  registerEvents(runtime.events)
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerEvents(events: EventRegistry): void {
  events.register({
    eventType: AI_PROVIDER_SELECTED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateProviderEvent,
  })
  events.register({
    eventType: CREDENTIAL_REFERENCE_CHANGED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: validateCredentialEvent,
  })
  events.register({
    eventType: PROJECT_SETTINGS_CHANGED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: payload => ({ settings: readSettingsEvent(readObject(payload)) }),
  })
}

function registerCommands(runtime: ProjectSettingsEventingRuntime): void {
  runtime.commands.register(CHANGE_PROJECT_AI_SETTINGS_COMMAND, async (command, context) => {
    const stream = settingsStream(command)
    const project = await runtime.aggregates.loadInSession(
      context.session,
      projectAggregate,
      {
        aggregateType: PROJECT_AGGREGATE_TYPE,
        aggregateId: command.aggregateId,
        projectId: command.projectId,
      },
    )
    if (!project.state.exists || project.state.deleted)
      throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')

    const loaded = await runtime.aggregates.loadInSession(
      context.session,
      projectSettingsAggregate,
      stream,
    )
    const timestamp = now()
    const settings = settingsSnapshot(command.aggregateId, command.payload, loaded.state, timestamp)
    const events: PendingEvent[] = [providerEvent(command, settings, timestamp)]
    if (credentialsChanged(loaded.state, settings))
      events.push(credentialEvent(command, settings, timestamp))
    events.push(settingsEvent(command, settings, timestamp))

    return {
      streams: [{ stream, expectedVersion: loaded.version, events }],
      result: settings,
    }
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: PROJECT_AI_SETTINGS_PROJECTION,
    mode: 'sync',
    handles: [PROJECT_SETTINGS_CHANGED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await transaction.delete(projectAISettings)
          .where(eq(projectAISettings.projectId, event.aggregateId))
        await deleteProjectCredentials(transaction, event.aggregateId)
        return
      }

      const settings = readSettingsEvent(event.payload)
      await transaction.insert(projectAISettings)
        .values(settings)
        .onConflictDoUpdate({
          target: projectAISettings.projectId,
          set: settings,
        })
    },
    reset: async (transaction, projectId) => {
      if (projectId) {
        await transaction.delete(projectAISettings)
          .where(eq(projectAISettings.projectId, projectId))
        return
      }
      await transaction.delete(projectAISettings)
    },
  })
}

function settingsStream(command: CommandEnvelope): StreamRef {
  if (command.aggregateType !== PROJECT_SETTINGS_AGGREGATE_TYPE || command.projectId !== command.aggregateId) {
    throw new DomainCommandError(
      'PROJECT_SCOPE_MISMATCH',
      'Project settings commands must target their owning project',
    )
  }
  return {
    aggregateType: PROJECT_SETTINGS_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId: command.projectId,
  }
}

function settingsSnapshot(
  projectId: string,
  input: JsonObject,
  current: ProjectSettingsState,
  timestamp: string,
): ProjectAISettingsSnapshot {
  return {
    projectId,
    provider: requiredString(input, 'provider'),
    baseUrl: requiredString(input, 'baseUrl'),
    model: requiredString(input, 'model'),
    temperature: boundedTemperature(input.temperature),
    credentialRef: nullableString(input, 'credentialRef'),
    credentialSuffix: nullableString(input, 'credentialSuffix'),
    embeddingProvider: requiredString(input, 'embeddingProvider'),
    embeddingBaseUrl: requiredString(input, 'embeddingBaseUrl'),
    embeddingModel: requiredString(input, 'embeddingModel'),
    embeddingCredentialRef: nullableString(input, 'embeddingCredentialRef'),
    embeddingCredentialSuffix: nullableString(input, 'embeddingCredentialSuffix'),
    embeddingEnabled: requiredBoolean(input, 'embeddingEnabled'),
    createdAt: current.exists ? current.createdAt : timestamp,
    updatedAt: timestamp,
  }
}

function providerEvent(
  command: CommandEnvelope,
  settings: ProjectAISettingsSnapshot,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(AI_PROVIDER_SELECTED, command, occurredAt, {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    embeddingProvider: settings.embeddingProvider,
    embeddingBaseUrl: settings.embeddingBaseUrl,
    embeddingModel: settings.embeddingModel,
  })
}

function credentialEvent(
  command: CommandEnvelope,
  settings: ProjectAISettingsSnapshot,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(CREDENTIAL_REFERENCE_CHANGED, command, occurredAt, {
    credentialRef: settings.credentialRef,
    credentialSuffix: settings.credentialSuffix,
    embeddingCredentialRef: settings.embeddingCredentialRef,
    embeddingCredentialSuffix: settings.embeddingCredentialSuffix,
  })
}

function settingsEvent(
  command: CommandEnvelope,
  settings: ProjectAISettingsSnapshot,
  occurredAt: string,
): PendingEvent {
  return pendingEvent(PROJECT_SETTINGS_CHANGED, command, occurredAt, { settings })
}

function pendingEvent(
  eventType: string,
  command: CommandEnvelope,
  occurredAt: string,
  payload: JsonObject,
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

function credentialsChanged(
  current: ProjectSettingsState,
  next: ProjectAISettingsSnapshot,
): boolean {
  return !current.exists
    || current.credentialRef !== next.credentialRef
    || current.embeddingCredentialRef !== next.embeddingCredentialRef
}

function validateProviderEvent(payload: unknown): JsonObject {
  const value = readObject(payload)
  return {
    provider: requiredString(value, 'provider'),
    baseUrl: requiredString(value, 'baseUrl'),
    model: requiredString(value, 'model'),
    embeddingProvider: requiredString(value, 'embeddingProvider'),
    embeddingBaseUrl: requiredString(value, 'embeddingBaseUrl'),
    embeddingModel: requiredString(value, 'embeddingModel'),
  }
}

function validateCredentialEvent(payload: unknown): JsonObject {
  const value = readObject(payload)
  return {
    credentialRef: nullableString(value, 'credentialRef'),
    credentialSuffix: nullableString(value, 'credentialSuffix'),
    embeddingCredentialRef: nullableString(value, 'embeddingCredentialRef'),
    embeddingCredentialSuffix: nullableString(value, 'embeddingCredentialSuffix'),
  }
}

function readSettingsEvent(payload: JsonObject): ProjectAISettingsSnapshot {
  const value = 'settings' in payload ? readObject(payload.settings) : payload
  return {
    projectId: requiredString(value, 'projectId'),
    provider: requiredString(value, 'provider'),
    baseUrl: requiredString(value, 'baseUrl'),
    model: requiredString(value, 'model'),
    temperature: boundedTemperature(value.temperature),
    credentialRef: nullableString(value, 'credentialRef'),
    credentialSuffix: nullableString(value, 'credentialSuffix'),
    embeddingProvider: requiredString(value, 'embeddingProvider'),
    embeddingBaseUrl: requiredString(value, 'embeddingBaseUrl'),
    embeddingModel: requiredString(value, 'embeddingModel'),
    embeddingCredentialRef: nullableString(value, 'embeddingCredentialRef'),
    embeddingCredentialSuffix: nullableString(value, 'embeddingCredentialSuffix'),
    embeddingEnabled: requiredBoolean(value, 'embeddingEnabled'),
    createdAt: requiredString(value, 'createdAt'),
    updatedAt: requiredString(value, 'updatedAt'),
  }
}

function requiredString(record: JsonObject, key: string): string {
  return payloadCodec.string(record, key)
}

function nullableString(record: JsonObject, key: string): string | null {
  return payloadCodec.nullableString(record, key)
}

function requiredBoolean(record: JsonObject, key: string): boolean {
  return payloadCodec.boolean(record, key)
}

function boundedTemperature(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new DomainCommandError('INVALID_PROJECT_SETTINGS', 'temperature must be a finite number')
  return Math.min(100, Math.max(0, Math.round(value)))
}

function readObject(value: unknown): JsonObject {
  return payloadCodec.object(value)
}
