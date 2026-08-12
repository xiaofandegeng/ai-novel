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
import { projectPromptOverrides } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import {
  PROJECT_AGGREGATE_TYPE,
  PROJECT_DELETED,
  projectAggregate,
} from '../project/project.eventing'

export const PROJECT_PROMPT_OVERRIDE_AGGREGATE_TYPE = 'ProjectPromptOverride'
export const PROJECT_PROMPT_OVERRIDES_PROJECTION = 'project-prompt-overrides'
export const SET_PROJECT_PROMPT_OVERRIDE_COMMAND = 'SetProjectPromptOverride'

export const PROMPT_TEMPLATE_SELECTED = 'PromptTemplateSelected'
export const PROJECT_PROMPT_OVERRIDE_CHANGED = 'ProjectPromptOverrideChanged'

const payloadCodec = createPayloadCodec('INVALID_PROMPT_OVERRIDE', 'Prompt override payload')

export type ProjectPromptOverrideSnapshot = JsonObject & {
  id: string
  projectId: string
  templateKey: string
  overrideSystemPrompt: string | null
  overrideUserPromptTemplate: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

type ProjectPromptOverrideState = ProjectPromptOverrideSnapshot & { exists: boolean }

export interface PromptSettingsEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

const promptOverrideAggregate: AggregateDefinition<ProjectPromptOverrideState> = {
  aggregateType: PROJECT_PROMPT_OVERRIDE_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    id: '',
    projectId: '',
    templateKey: '',
    overrideSystemPrompt: null,
    overrideUserPromptTemplate: null,
    enabled: false,
    createdAt: '',
    updatedAt: '',
    exists: false,
  }),
  evolve: (state, event) => event.eventType === PROJECT_PROMPT_OVERRIDE_CHANGED
    ? { ...readOverrideEvent(event.payload), exists: true }
    : state,
}

export function registerPromptSettingsEventing(runtime: PromptSettingsEventingRuntime): void {
  registerEvents(runtime.events)
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

export function promptOverrideAggregateId(projectId: string, templateKey: string): string {
  return `${projectId}/${encodeURIComponent(templateKey)}`
}

function registerEvents(events: EventRegistry): void {
  events.register({
    eventType: PROMPT_TEMPLATE_SELECTED,
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: validateTemplateSelected,
  })
  events.register({
    eventType: PROJECT_PROMPT_OVERRIDE_CHANGED,
    currentSchemaVersion: 1,
    payloadProtection: 'project-content',
    upcasters: {},
    validate: payload => ({ override: readOverrideEvent(readObject(payload)) }),
  })
}

function registerCommands(runtime: PromptSettingsEventingRuntime): void {
  runtime.commands.register(SET_PROJECT_PROMPT_OVERRIDE_COMMAND, async (command, context) => {
    const stream = overrideStream(command)
    const project = await runtime.aggregates.loadInSession(
      context.session,
      projectAggregate,
      {
        aggregateType: PROJECT_AGGREGATE_TYPE,
        aggregateId: command.projectId!,
        projectId: command.projectId,
      },
    )
    if (!project.state.exists || project.state.deleted)
      throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')

    const loaded = await runtime.aggregates.loadInSession(
      context.session,
      promptOverrideAggregate,
      stream,
    )
    const timestamp = now()
    const override = overrideSnapshot(command, loaded.state, timestamp)
    const events: PendingEvent[] = [
      pendingEvent(PROMPT_TEMPLATE_SELECTED, command, timestamp, {
        projectId: override.projectId,
        templateKey: override.templateKey,
      }),
      pendingEvent(PROJECT_PROMPT_OVERRIDE_CHANGED, command, timestamp, { override }),
    ]

    return {
      streams: [{ stream, expectedVersion: loaded.version, events }],
      result: { ...override, created: !loaded.state.exists },
    }
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: PROJECT_PROMPT_OVERRIDES_PROJECTION,
    mode: 'sync',
    handles: [PROJECT_PROMPT_OVERRIDE_CHANGED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await transaction.delete(projectPromptOverrides)
          .where(eq(projectPromptOverrides.projectId, event.aggregateId))
        return
      }

      const override = readOverrideEvent(event.payload)
      const row = {
        ...override,
        enabled: override.enabled ? 1 : 0,
      }
      await transaction.insert(projectPromptOverrides)
        .values(row)
        .onConflictDoUpdate({
          target: projectPromptOverrides.id,
          set: row,
        })
    },
    reset: async (transaction, projectId) => {
      if (projectId) {
        await transaction.delete(projectPromptOverrides)
          .where(eq(projectPromptOverrides.projectId, projectId))
        return
      }
      await transaction.delete(projectPromptOverrides)
    },
  })
}

function overrideStream(command: CommandEnvelope): StreamRef {
  const projectId = command.projectId
  const templateKey = requiredString(command.payload, 'templateKey')
  if (
    !projectId
    || command.aggregateType !== PROJECT_PROMPT_OVERRIDE_AGGREGATE_TYPE
    || command.aggregateId !== promptOverrideAggregateId(projectId, templateKey)
  ) {
    throw new DomainCommandError(
      'PROJECT_SCOPE_MISMATCH',
      'Prompt override commands must target their owning project and template',
    )
  }
  return {
    aggregateType: PROJECT_PROMPT_OVERRIDE_AGGREGATE_TYPE,
    aggregateId: command.aggregateId,
    projectId,
  }
}

function overrideSnapshot(
  command: CommandEnvelope,
  current: ProjectPromptOverrideState,
  timestamp: string,
): ProjectPromptOverrideSnapshot {
  const templateKey = requiredString(command.payload, 'templateKey')
  return {
    id: command.aggregateId,
    projectId: command.projectId!,
    templateKey,
    overrideSystemPrompt: nextNullableString(
      command.payload,
      'overrideSystemPrompt',
      current.overrideSystemPrompt,
    ),
    overrideUserPromptTemplate: nextNullableString(
      command.payload,
      'overrideUserPromptTemplate',
      current.overrideUserPromptTemplate,
    ),
    enabled: nextBoolean(command.payload, 'enabled', current.exists ? current.enabled : false),
    createdAt: current.exists ? current.createdAt : timestamp,
    updatedAt: timestamp,
  }
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

function validateTemplateSelected(payload: unknown): JsonObject {
  const value = readObject(payload)
  return {
    projectId: requiredString(value, 'projectId'),
    templateKey: requiredString(value, 'templateKey'),
  }
}

function readOverrideEvent(payload: JsonObject): ProjectPromptOverrideSnapshot {
  const value = 'override' in payload ? readObject(payload.override) : payload
  return {
    id: requiredString(value, 'id'),
    projectId: requiredString(value, 'projectId'),
    templateKey: requiredString(value, 'templateKey'),
    overrideSystemPrompt: nullableString(value, 'overrideSystemPrompt'),
    overrideUserPromptTemplate: nullableString(value, 'overrideUserPromptTemplate'),
    enabled: requiredBoolean(value, 'enabled'),
    createdAt: requiredString(value, 'createdAt'),
    updatedAt: requiredString(value, 'updatedAt'),
  }
}

function nextNullableString(
  record: JsonObject,
  key: string,
  fallback: string | null,
): string | null {
  return key in record ? nullableString(record, key) : fallback
}

function nextBoolean(record: JsonObject, key: string, fallback: boolean): boolean {
  return key in record ? requiredBoolean(record, key) : fallback
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

function readObject(value: unknown): JsonObject {
  return payloadCodec.object(value)
}
