import type { AggregateDefinition, AggregateRepository, CommandBus, CommandEnvelope, EventRegistry, JsonObject, PendingEvent, ProjectionRegistry, StreamRef } from '../../eventing'
import { eq } from 'drizzle-orm'
import { aiContextSnapshots, aiGenerationCandidates, aiUsageRecords, knowledgeEmbeddings, projectHealthReports, promptTemplateRuns, qualityReports } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { PROJECT_AGGREGATE_TYPE, PROJECT_DELETED, projectAggregate } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const AI_OPERATION_AGGREGATE_TYPE = 'AIOperation'
export const AI_OPERATIONS_PROJECTION = 'ai-operations'
export const RECORD_AI_OPERATION_COMMAND = 'RecordAIOperation'
export const CHANGE_AI_OPERATION_COMMAND = 'ChangeAIOperation'
export const AI_OPERATION_RECORDED = 'AIOperationRecorded'
export const AI_OPERATION_CHANGED = 'AIOperationChanged'

const KINDS = ['candidate', 'context_snapshot', 'usage', 'prompt_run', 'health_report', 'quality_report', 'embedding'] as const
type OperationKind = typeof KINDS[number]
const codec = createPayloadCodec('INVALID_AI_OPERATION', 'AI operation payload')

interface OperationSnapshot extends JsonObject {
  id: string
  projectId: string
  kind: OperationKind
  data: JsonObject
}

interface OperationState extends OperationSnapshot {
  exists: boolean
}

export interface AIOperationsEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const aiOperationAggregate: AggregateDefinition<OperationState> = {
  aggregateType: AI_OPERATION_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({ exists: false, id: '', projectId: '', kind: 'candidate', data: {} }),
  evolve: (state, event) => {
    if (![AI_OPERATION_RECORDED, AI_OPERATION_CHANGED].includes(event.eventType))
      return state
    const operation = readOperation(event.payload)
    return { ...operation, data: operation.data, exists: true }
  },
}

export function registerAIOperationsEventing(runtime: AIOperationsEventingRuntime): void {
  for (const eventType of [AI_OPERATION_RECORDED, AI_OPERATION_CHANGED])
    runtime.events.register({ eventType, currentSchemaVersion: 1, payloadProtection: 'project-content', upcasters: {}, validate: payload => ({ operation: readOperation(codec.object(payload)) }) })
  runtime.commands.register(RECORD_AI_OPERATION_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, aiOperationAggregate, stream(command))
    if (loaded.state.exists)
      throw new DomainCommandError('AI_OPERATION_ALREADY_EXISTS', 'AI operation already exists')
    const kind = codec.enum(command.payload, 'kind', KINDS)
    const data = normalize(kind, codec.object(command.payload.data), command.projectId!, command.aggregateId, now())
    await assertChapter(runtime, context.session, command.projectId!, data)
    return decision(loaded.version, command, AI_OPERATION_RECORDED, { operation: { id: command.aggregateId, projectId: command.projectId!, kind, data } }, { id: command.aggregateId, projectId: command.projectId!, kind, data }, now())
  })
  runtime.commands.register(CHANGE_AI_OPERATION_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, aiOperationAggregate, stream(command))
    if (!loaded.state.exists)
      throw new DomainCommandError('AI_OPERATION_NOT_FOUND', 'AI operation not found')
    const kind = codec.enum(command.payload, 'kind', KINDS)
    if (kind !== loaded.state.kind || !['candidate', 'embedding'].includes(kind))
      throw new DomainCommandError('AI_OPERATION_IMMUTABLE', 'AI operation is immutable')
    const data = normalize(kind, { ...loaded.state.data, ...codec.object(command.payload.data) }, command.projectId!, command.aggregateId, now())
    return decision(loaded.version, command, AI_OPERATION_CHANGED, { operation: { id: command.aggregateId, projectId: command.projectId!, kind, data } }, { id: command.aggregateId, projectId: command.projectId!, kind, data }, now())
  })
  runtime.projections.register({
    name: AI_OPERATIONS_PROJECTION,
    mode: 'sync',
    handles: [AI_OPERATION_RECORDED, AI_OPERATION_CHANGED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await resetProjection(transaction, event.aggregateId)
        return
      }
      const operation = readOperation(event.payload)
      const data = operation.data
      if (operation.kind === 'candidate') {
        if (event.eventType === AI_OPERATION_RECORDED)
          await transaction.insert(aiGenerationCandidates).values(data as typeof aiGenerationCandidates.$inferInsert)
        else
          await transaction.update(aiGenerationCandidates).set(data as typeof aiGenerationCandidates.$inferInsert).where(eq(aiGenerationCandidates.id, operation.id))
      }
      else if (operation.kind === 'context_snapshot') {
        await transaction.insert(aiContextSnapshots).values(data as typeof aiContextSnapshots.$inferInsert)
      }
      else if (operation.kind === 'usage') {
        await transaction.insert(aiUsageRecords).values(data as typeof aiUsageRecords.$inferInsert)
      }
      else if (operation.kind === 'prompt_run') {
        await transaction.insert(promptTemplateRuns).values(data as typeof promptTemplateRuns.$inferInsert)
      }
      else if (operation.kind === 'health_report') {
        await transaction.insert(projectHealthReports).values(data as typeof projectHealthReports.$inferInsert)
      }
      else if (operation.kind === 'quality_report') {
        await transaction.insert(qualityReports).values(data as typeof qualityReports.$inferInsert)
      }
      else if (event.eventType === AI_OPERATION_RECORDED) {
        await transaction.insert(knowledgeEmbeddings).values(data as typeof knowledgeEmbeddings.$inferInsert)
      }
      else {
        await transaction.update(knowledgeEmbeddings).set(data as typeof knowledgeEmbeddings.$inferInsert).where(eq(knowledgeEmbeddings.id, operation.id))
      }
    },
    reset: resetProjection,
  })
}

function normalize(kind: OperationKind, input: JsonObject, projectId: string, id: string, timestamp: string): JsonObject {
  if (kind === 'candidate') {
    return { id, projectId, chapterId: codec.nullableString(input, 'chapterId'), contextSnapshotId: codec.nullableString(input, 'contextSnapshotId'), provider: codec.string(input, 'provider'), model: codec.string(input, 'model'), taskType: codec.string(input, 'taskType'), content: codec.string(input, 'content', { allowEmpty: true, trim: false }), qualityScore: codec.nullableInteger(input, 'qualityScore'), userSelected: 'userSelected' in input ? codec.integer(input, 'userSelected', { minimum: 0, maximum: 1 }) : 0, userRating: codec.nullableInteger(input, 'userRating', { minimum: 1, maximum: 5 }), createdAt: codec.nullableString(input, 'createdAt') ?? timestamp, updatedAt: timestamp }
  }
  if (kind === 'context_snapshot') {
    return { id, projectId, chapterId: codec.nullableString(input, 'chapterId'), scene: codec.nullableString(input, 'scene'), requestId: codec.string(input, 'requestId'), modelProvider: codec.nullableString(input, 'modelProvider'), modelName: codec.nullableString(input, 'modelName'), contextPayload: codec.nullableString(input, 'contextPayload'), renderedPromptPreview: codec.nullableString(input, 'renderedPromptPreview'), tokenEstimate: codec.nullableInteger(input, 'tokenEstimate'), createdAt: timestamp }
  }
  if (kind === 'usage') {
    return { id, projectId, chapterId: codec.nullableString(input, 'chapterId'), contextSnapshotId: codec.nullableString(input, 'contextSnapshotId'), provider: codec.string(input, 'provider'), model: codec.string(input, 'model'), taskType: codec.string(input, 'taskType'), promptTokens: codec.integer(input, 'promptTokens', { minimum: 0 }), completionTokens: codec.integer(input, 'completionTokens', { minimum: 0 }), totalTokens: codec.integer(input, 'totalTokens', { minimum: 0 }), estimatedCost: codec.nullableString(input, 'estimatedCost'), latencyMs: codec.integer(input, 'latencyMs', { minimum: 0 }), status: codec.string(input, 'status'), errorCode: codec.nullableString(input, 'errorCode'), createdAt: timestamp }
  }
  if (kind === 'prompt_run') {
    return { id, projectId, contextSnapshotId: codec.nullableString(input, 'contextSnapshotId'), templateId: codec.string(input, 'templateId'), templateVersion: codec.string(input, 'templateVersion'), renderedPreview: codec.nullableString(input, 'renderedPreview'), createdAt: timestamp }
  }
  if (kind === 'health_report') {
    return { id, projectId, scope: codec.string(input, 'scope'), score: codec.integer(input, 'score'), riskLevel: codec.enum(input, 'riskLevel', ['low', 'medium', 'high'] as const), metricsJson: input.metricsJson ?? null, generatedAt: timestamp }
  }
  if (kind === 'quality_report') {
    return { id, projectId, chapterId: codec.nullableString(input, 'chapterId'), scope: codec.enum(input, 'scope', ['chapter', 'book'] as const), score: codec.integer(input, 'score'), rhythmScore: codec.nullableInteger(input, 'rhythmScore'), conflictScore: codec.nullableInteger(input, 'conflictScore'), logicScore: codec.nullableInteger(input, 'logicScore'), characterScore: codec.nullableInteger(input, 'characterScore'), styleScore: codec.nullableInteger(input, 'styleScore'), issues: codec.nullableString(input, 'issues'), suggestions: codec.nullableString(input, 'suggestions'), createdAt: timestamp }
  }
  const embeddingVector = input.embeddingVector
  if (embeddingVector !== null && (!Array.isArray(embeddingVector) || embeddingVector.length !== 1536 || embeddingVector.some(value => typeof value !== 'number' || !Number.isFinite(value))))
    throw new DomainCommandError('INVALID_AI_OPERATION', 'embeddingVector must contain 1536 finite numbers')
  return { id, projectId, sourceId: codec.nullableString(input, 'sourceId'), chunkId: codec.nullableString(input, 'chunkId'), embeddingModel: codec.string(input, 'embeddingModel'), embeddingVector: embeddingVector ?? null, contentType: codec.enum(input, 'contentType', ['knowledge_summary', 'technique', 'chapter_memory', 'fact_summary', 'persona_memory', 'style_fingerprint'] as const), contentHash: codec.string(input, 'contentHash'), createdAt: codec.nullableString(input, 'createdAt') ?? timestamp, updatedAt: timestamp }
}

function readOperation(payload: JsonObject): OperationSnapshot {
  const value = 'operation' in payload ? codec.object(payload.operation) : payload
  return { id: codec.string(value, 'id'), projectId: codec.string(value, 'projectId'), kind: codec.enum(value, 'kind', KINDS), data: codec.object(value.data) }
}

async function assertActiveProject(runtime: AIOperationsEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  if (!command.projectId || command.aggregateType !== AI_OPERATION_AGGREGATE_TYPE)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'AI operation command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, { aggregateType: PROJECT_AGGREGATE_TYPE, aggregateId: command.projectId, projectId: command.projectId })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function assertChapter(runtime: AIOperationsEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, data: JsonObject) {
  const chapterId = codec.nullableString(data, 'chapterId')
  if (!chapterId)
    return
  const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, { aggregateType: CHAPTER_AGGREGATE_TYPE, aggregateId: chapterId, projectId })
  if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
    throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
}

async function resetProjection(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  const tables = [aiGenerationCandidates, aiUsageRecords, promptTemplateRuns, aiContextSnapshots, knowledgeEmbeddings, projectHealthReports, qualityReports] as const
  for (const table of tables) {
    if (projectId)
      await transaction.delete(table).where(eq(table.projectId, projectId))
    else
      await transaction.delete(table)
  }
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, eventType: string, payload: JsonObject, result: TResult, occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events: [pendingEvent(eventType, payload, command, occurredAt)] }], result }
}
function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  return { aggregateType: AI_OPERATION_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}
