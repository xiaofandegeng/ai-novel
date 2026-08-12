import type { AggregateDefinition, AggregateRepository, CommandBus, CommandEnvelope, EventRegistry, JsonObject, PendingEvent, ProjectionRegistry, StreamRef } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { chapterPostprocessRuns, chapterPostprocessSuggestions, chapterStyleFingerprints } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { PROJECT_AGGREGATE_TYPE, PROJECT_DELETED, projectAggregate } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const POSTPROCESS_RUN_AGGREGATE_TYPE = 'PostprocessRun'
export const POSTPROCESS_SUGGESTION_AGGREGATE_TYPE = 'PostprocessSuggestion'
export const STYLE_FINGERPRINT_AGGREGATE_TYPE = 'StyleFingerprint'
export const POSTPROCESS_PROJECTION = 'postprocess'

export const REQUEST_POSTPROCESS_RUN_COMMAND = 'RequestPostprocessRun'
export const CHANGE_POSTPROCESS_RUN_COMMAND = 'ChangePostprocessRun'
export const GENERATE_POSTPROCESS_SUGGESTION_COMMAND = 'GeneratePostprocessSuggestion'
export const CHANGE_POSTPROCESS_SUGGESTION_COMMAND = 'ChangePostprocessSuggestion'
export const RECORD_STYLE_FINGERPRINT_COMMAND = 'RecordStyleFingerprint'

export const POSTPROCESS_RUN_REQUESTED = 'PostprocessRunRequested'
export const POSTPROCESS_RUN_CHANGED = 'PostprocessRunChanged'
export const POSTPROCESS_SUGGESTION_GENERATED = 'PostprocessSuggestionGenerated'
export const POSTPROCESS_SUGGESTION_CHANGED = 'PostprocessSuggestionChanged'
export const STYLE_FINGERPRINT_RECORDED = 'StyleFingerprintRecorded'

const RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const
const SUGGESTION_STATUSES = ['pending', 'accepted', 'applying', 'rejected', 'applied', 'acknowledged', 'apply_failed'] as const
const SUGGESTION_TYPES = ['fact_triple', 'foreshadowing_add', 'foreshadowing_payoff', 'chapter_element', 'character_add', 'character_state', 'conflict_add', 'conflict_update', 'continuity_note', 'style_note', 'relationship_update'] as const
const SCOPES = ['chapter', 'scene'] as const
const runCodec = createPayloadCodec('INVALID_POSTPROCESS_RUN', 'Postprocess run payload')
const suggestionCodec = createPayloadCodec('INVALID_POSTPROCESS_SUGGESTION', 'Postprocess suggestion payload')
const fingerprintCodec = createPayloadCodec('INVALID_STYLE_FINGERPRINT', 'Style fingerprint payload')

export type PostprocessRunSnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  autonomousRunId: string | null
  writingJobId: string | null
  status: typeof RUN_STATUSES[number]
  trigger: string
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PostprocessSuggestionSnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  runId: string | null
  autonomousRunId: string | null
  writingJobId: string | null
  suggestionType: typeof SUGGESTION_TYPES[number]
  payload: string
  confidence: number
  status: typeof SUGGESTION_STATUSES[number]
  reason: string | null
  createdAt: string
  updatedAt: string
}

export type StyleFingerprintSnapshot = JsonObject & {
  id: string
  projectId: string
  chapterId: string
  sceneId: string | null
  scope: typeof SCOPES[number]
  sentenceLengthAvg: number | null
  dialogueRatio: number | null
  emotionDensity: number | null
  conflictDensity: number | null
  hookDensity: number | null
  styleSummary: string | null
  embeddingId: string | null
  createdAt: string
}

interface RunState extends PostprocessRunSnapshot { exists: boolean }
interface SuggestionState extends PostprocessSuggestionSnapshot { exists: boolean }
interface FingerprintState extends StyleFingerprintSnapshot { exists: boolean }

export interface PostprocessEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const postprocessRunAggregate: AggregateDefinition<RunState> = aggregateDefinition(POSTPROCESS_RUN_AGGREGATE_TYPE, emptyRun(), readRun, [POSTPROCESS_RUN_REQUESTED, POSTPROCESS_RUN_CHANGED])
export const postprocessSuggestionAggregate: AggregateDefinition<SuggestionState> = aggregateDefinition(POSTPROCESS_SUGGESTION_AGGREGATE_TYPE, emptySuggestion(), readSuggestion, [POSTPROCESS_SUGGESTION_GENERATED, POSTPROCESS_SUGGESTION_CHANGED])
export const styleFingerprintAggregate: AggregateDefinition<FingerprintState> = aggregateDefinition(STYLE_FINGERPRINT_AGGREGATE_TYPE, emptyFingerprint(), readFingerprint, [STYLE_FINGERPRINT_RECORDED])

export function registerPostprocessEventing(runtime: PostprocessEventingRuntime): void {
  for (const eventType of [POSTPROCESS_RUN_REQUESTED, POSTPROCESS_RUN_CHANGED])
    runtime.events.register({ eventType, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ run: readRun(runCodec.object(payload)) }) })
  for (const eventType of [POSTPROCESS_SUGGESTION_GENERATED, POSTPROCESS_SUGGESTION_CHANGED])
    runtime.events.register({ eventType, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ suggestion: readSuggestion(suggestionCodec.object(payload)) }) })
  runtime.events.register({ eventType: STYLE_FINGERPRINT_RECORDED, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ fingerprint: readFingerprint(fingerprintCodec.object(payload)) }) })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: PostprocessEventingRuntime): void {
  runtime.commands.register(REQUEST_POSTPROCESS_RUN_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session, POSTPROCESS_RUN_AGGREGATE_TYPE)
    const loaded = await runtime.aggregates.loadInSession(context.session, postprocessRunAggregate, stream(command))
    if (loaded.state.exists)
      throw new DomainCommandError('POSTPROCESS_RUN_ALREADY_EXISTS', 'Postprocess run already exists')
    await assertChapter(runtime, context.session, command.projectId!, command.payload, runCodec)
    const timestamp = now()
    const run = createRun(command, timestamp)
    return decision(loaded.version, command, POSTPROCESS_RUN_REQUESTED, { run }, run, timestamp)
  })
  runtime.commands.register(CHANGE_POSTPROCESS_RUN_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session, POSTPROCESS_RUN_AGGREGATE_TYPE)
    const loaded = await runtime.aggregates.loadInSession(context.session, postprocessRunAggregate, stream(command))
    if (!loaded.state.exists)
      throw new DomainCommandError('POSTPROCESS_RUN_NOT_FOUND', 'Postprocess run not found')
    const timestamp = now()
    const run = changeRun(loaded.state, command.payload, timestamp)
    return decision(loaded.version, command, POSTPROCESS_RUN_CHANGED, { run }, run, timestamp)
  })
  runtime.commands.register(GENERATE_POSTPROCESS_SUGGESTION_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session, POSTPROCESS_SUGGESTION_AGGREGATE_TYPE)
    const loaded = await runtime.aggregates.loadInSession(context.session, postprocessSuggestionAggregate, stream(command))
    if (loaded.state.exists)
      throw new DomainCommandError('POSTPROCESS_SUGGESTION_ALREADY_EXISTS', 'Postprocess suggestion already exists')
    await assertChapter(runtime, context.session, command.projectId!, command.payload, suggestionCodec)
    const runId = suggestionCodec.nullableString(command.payload, 'runId')
    if (runId) {
      const run = await runtime.aggregates.loadInSession(context.session, postprocessRunAggregate, { aggregateType: POSTPROCESS_RUN_AGGREGATE_TYPE, aggregateId: runId, projectId: command.projectId })
      if (!run.state.exists || run.state.chapterId !== suggestionCodec.string(command.payload, 'chapterId'))
        throw new DomainCommandError('POSTPROCESS_RUN_NOT_FOUND', 'Postprocess run not found')
    }
    const timestamp = now()
    const suggestion = createSuggestion(command, timestamp)
    return decision(loaded.version, command, POSTPROCESS_SUGGESTION_GENERATED, { suggestion }, suggestion, timestamp)
  })
  runtime.commands.register(CHANGE_POSTPROCESS_SUGGESTION_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session, POSTPROCESS_SUGGESTION_AGGREGATE_TYPE)
    const loaded = await runtime.aggregates.loadInSession(context.session, postprocessSuggestionAggregate, stream(command))
    if (!loaded.state.exists)
      throw new DomainCommandError('POSTPROCESS_SUGGESTION_NOT_FOUND', 'Postprocess suggestion not found')
    const timestamp = now()
    const suggestion = changeSuggestion(loaded.state, command.payload, timestamp)
    return decision(loaded.version, command, POSTPROCESS_SUGGESTION_CHANGED, { suggestion }, suggestion, timestamp)
  })
  runtime.commands.register(RECORD_STYLE_FINGERPRINT_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session, STYLE_FINGERPRINT_AGGREGATE_TYPE)
    const loaded = await runtime.aggregates.loadInSession(context.session, styleFingerprintAggregate, stream(command))
    await assertChapter(runtime, context.session, command.projectId!, command.payload, fingerprintCodec, true)
    const timestamp = now()
    const fingerprint = createFingerprint(command, loaded.state, timestamp)
    return decision(loaded.version, command, STYLE_FINGERPRINT_RECORDED, { fingerprint }, fingerprint, timestamp)
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: POSTPROCESS_PROJECTION,
    mode: 'sync',
    handles: [POSTPROCESS_RUN_REQUESTED, POSTPROCESS_RUN_CHANGED, POSTPROCESS_SUGGESTION_GENERATED, POSTPROCESS_SUGGESTION_CHANGED, STYLE_FINGERPRINT_RECORDED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await resetProjection(transaction, event.aggregateId)
        return
      }
      if (event.eventType === POSTPROCESS_RUN_REQUESTED) {
        await transaction.insert(chapterPostprocessRuns).values(readRun(event.payload))
        return
      }
      if (event.eventType === POSTPROCESS_RUN_CHANGED) {
        const run = readRun(event.payload)
        await transaction.update(chapterPostprocessRuns).set(run).where(and(eq(chapterPostprocessRuns.id, run.id), eq(chapterPostprocessRuns.projectId, run.projectId)))
        return
      }
      if (event.eventType === POSTPROCESS_SUGGESTION_GENERATED) {
        await transaction.insert(chapterPostprocessSuggestions).values(readSuggestion(event.payload))
        return
      }
      if (event.eventType === POSTPROCESS_SUGGESTION_CHANGED) {
        const suggestion = readSuggestion(event.payload)
        await transaction.update(chapterPostprocessSuggestions).set(suggestion).where(and(eq(chapterPostprocessSuggestions.id, suggestion.id), eq(chapterPostprocessSuggestions.projectId, suggestion.projectId)))
        return
      }
      const fingerprint = readFingerprint(event.payload)
      await transaction.insert(chapterStyleFingerprints).values(fingerprint).onConflictDoUpdate({ target: chapterStyleFingerprints.id, set: fingerprint })
    },
    reset: resetProjection,
  })
}

async function resetProjection(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  if (projectId) {
    await transaction.delete(chapterPostprocessSuggestions).where(eq(chapterPostprocessSuggestions.projectId, projectId))
    await transaction.delete(chapterStyleFingerprints).where(eq(chapterStyleFingerprints.projectId, projectId))
    await transaction.delete(chapterPostprocessRuns).where(eq(chapterPostprocessRuns.projectId, projectId))
    return
  }
  await transaction.delete(chapterPostprocessSuggestions)
  await transaction.delete(chapterStyleFingerprints)
  await transaction.delete(chapterPostprocessRuns)
}

function aggregateDefinition<TState extends JsonObject & { exists: boolean }>(aggregateType: string, initial: TState, reader: (payload: JsonObject) => Omit<TState, 'exists'>, handles: string[]): AggregateDefinition<TState> {
  return { aggregateType, snapshotEvery: 100, snapshotSchemaVersion: 1, initialState: () => ({ ...initial }), evolve: (state, event) => handles.includes(event.eventType) ? { ...state, ...reader(event.payload), exists: true } : state }
}

async function assertActiveProject(runtime: PostprocessEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0], aggregateType: string) {
  if (!command.projectId || command.aggregateType !== aggregateType)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Postprocess command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, { aggregateType: PROJECT_AGGREGATE_TYPE, aggregateId: command.projectId, projectId: command.projectId })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function assertChapter(runtime: PostprocessEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, payload: JsonObject, codec: ReturnType<typeof createPayloadCodec>, validateScene = false) {
  const chapterId = codec.string(payload, 'chapterId')
  const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, { aggregateType: CHAPTER_AGGREGATE_TYPE, aggregateId: chapterId, projectId })
  if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
    throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
  if (validateScene) {
    const sceneId = codec.nullableString(payload, 'sceneId')
    if (sceneId && (!chapter.state.scenes[sceneId] || chapter.state.scenes[sceneId].deleted))
      throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
  }
}

function createRun(command: CommandEnvelope, timestamp: string): PostprocessRunSnapshot {
  return { id: command.aggregateId, projectId: command.projectId!, chapterId: runCodec.string(command.payload, 'chapterId'), autonomousRunId: runCodec.nullableString(command.payload, 'autonomousRunId'), writingJobId: runCodec.nullableString(command.payload, 'writingJobId'), status: 'running', trigger: runCodec.string(command.payload, 'trigger'), errorMessage: null, startedAt: timestamp, finishedAt: null, createdAt: timestamp, updatedAt: timestamp }
}

function changeRun(current: PostprocessRunSnapshot, payload: JsonObject, timestamp: string): PostprocessRunSnapshot {
  const status = 'status' in payload ? runCodec.enum(payload, 'status', RUN_STATUSES) : current.status
  if (status !== current.status && !({ pending: ['running', 'failed'], running: ['completed', 'failed'], completed: [], failed: [] } as Record<PostprocessRunSnapshot['status'], PostprocessRunSnapshot['status'][]>)[current.status].includes(status))
    throw new DomainCommandError('INVALID_POSTPROCESS_RUN_TRANSITION', `Cannot transition postprocess run from ${current.status} to ${status}`)
  return { ...current, status, errorMessage: runCodec.nextNullableString(payload, 'errorMessage', current.errorMessage), startedAt: runCodec.nextNullableString(payload, 'startedAt', current.startedAt), finishedAt: runCodec.nextNullableString(payload, 'finishedAt', current.finishedAt), updatedAt: timestamp }
}

function createSuggestion(command: CommandEnvelope, timestamp: string): PostprocessSuggestionSnapshot {
  return { id: command.aggregateId, projectId: command.projectId!, chapterId: suggestionCodec.string(command.payload, 'chapterId'), runId: suggestionCodec.nullableString(command.payload, 'runId'), autonomousRunId: suggestionCodec.nullableString(command.payload, 'autonomousRunId'), writingJobId: suggestionCodec.nullableString(command.payload, 'writingJobId'), suggestionType: suggestionCodec.enum(command.payload, 'suggestionType', SUGGESTION_TYPES), payload: suggestionCodec.string(command.payload, 'payload', { allowEmpty: true, trim: false }), confidence: suggestionCodec.integer(command.payload, 'confidence', { minimum: 0, maximum: 100 }), status: 'pending', reason: suggestionCodec.nullableString(command.payload, 'reason'), createdAt: timestamp, updatedAt: timestamp }
}

function changeSuggestion(current: PostprocessSuggestionSnapshot, payload: JsonObject, timestamp: string): PostprocessSuggestionSnapshot {
  const status = suggestionCodec.enum(payload, 'status', SUGGESTION_STATUSES)
  const allowed: Record<PostprocessSuggestionSnapshot['status'], PostprocessSuggestionSnapshot['status'][]> = { pending: ['accepted', 'applying', 'rejected'], accepted: ['applying', 'rejected'], applying: ['applied', 'acknowledged', 'apply_failed'], rejected: [], applied: [], acknowledged: [], apply_failed: ['applying', 'rejected'] }
  if (status !== current.status && !allowed[current.status].includes(status))
    throw new DomainCommandError('INVALID_POSTPROCESS_SUGGESTION_TRANSITION', `Cannot transition postprocess suggestion from ${current.status} to ${status}`)
  return { ...current, status, updatedAt: timestamp }
}

function createFingerprint(command: CommandEnvelope, current: FingerprintState, timestamp: string): StyleFingerprintSnapshot {
  return { id: command.aggregateId, projectId: command.projectId!, chapterId: fingerprintCodec.string(command.payload, 'chapterId'), sceneId: fingerprintCodec.nullableString(command.payload, 'sceneId'), scope: fingerprintCodec.enum(command.payload, 'scope', SCOPES), sentenceLengthAvg: fingerprintCodec.nullableInteger(command.payload, 'sentenceLengthAvg'), dialogueRatio: fingerprintCodec.nullableInteger(command.payload, 'dialogueRatio'), emotionDensity: fingerprintCodec.nullableInteger(command.payload, 'emotionDensity'), conflictDensity: fingerprintCodec.nullableInteger(command.payload, 'conflictDensity'), hookDensity: fingerprintCodec.nullableInteger(command.payload, 'hookDensity'), styleSummary: fingerprintCodec.nullableString(command.payload, 'styleSummary'), embeddingId: fingerprintCodec.nullableString(command.payload, 'embeddingId'), createdAt: current.exists ? current.createdAt : timestamp }
}

function readRun(payload: JsonObject): PostprocessRunSnapshot {
  const v = 'run' in payload ? runCodec.object(payload.run) : payload
  return { id: runCodec.string(v, 'id'), projectId: runCodec.string(v, 'projectId'), chapterId: runCodec.string(v, 'chapterId'), autonomousRunId: runCodec.nullableString(v, 'autonomousRunId'), writingJobId: runCodec.nullableString(v, 'writingJobId'), status: runCodec.enum(v, 'status', RUN_STATUSES), trigger: runCodec.string(v, 'trigger'), errorMessage: runCodec.nullableString(v, 'errorMessage'), startedAt: runCodec.nullableString(v, 'startedAt'), finishedAt: runCodec.nullableString(v, 'finishedAt'), createdAt: runCodec.string(v, 'createdAt'), updatedAt: runCodec.string(v, 'updatedAt') }
}

function readSuggestion(payload: JsonObject): PostprocessSuggestionSnapshot {
  const v = 'suggestion' in payload ? suggestionCodec.object(payload.suggestion) : payload
  return { id: suggestionCodec.string(v, 'id'), projectId: suggestionCodec.string(v, 'projectId'), chapterId: suggestionCodec.string(v, 'chapterId'), runId: suggestionCodec.nullableString(v, 'runId'), autonomousRunId: suggestionCodec.nullableString(v, 'autonomousRunId'), writingJobId: suggestionCodec.nullableString(v, 'writingJobId'), suggestionType: suggestionCodec.enum(v, 'suggestionType', SUGGESTION_TYPES), payload: suggestionCodec.string(v, 'payload', { allowEmpty: true, trim: false }), confidence: suggestionCodec.integer(v, 'confidence'), status: suggestionCodec.enum(v, 'status', SUGGESTION_STATUSES), reason: suggestionCodec.nullableString(v, 'reason'), createdAt: suggestionCodec.string(v, 'createdAt'), updatedAt: suggestionCodec.string(v, 'updatedAt') }
}

function readFingerprint(payload: JsonObject): StyleFingerprintSnapshot {
  const v = 'fingerprint' in payload ? fingerprintCodec.object(payload.fingerprint) : payload
  return { id: fingerprintCodec.string(v, 'id'), projectId: fingerprintCodec.string(v, 'projectId'), chapterId: fingerprintCodec.string(v, 'chapterId'), sceneId: fingerprintCodec.nullableString(v, 'sceneId'), scope: fingerprintCodec.enum(v, 'scope', SCOPES), sentenceLengthAvg: fingerprintCodec.nullableInteger(v, 'sentenceLengthAvg'), dialogueRatio: fingerprintCodec.nullableInteger(v, 'dialogueRatio'), emotionDensity: fingerprintCodec.nullableInteger(v, 'emotionDensity'), conflictDensity: fingerprintCodec.nullableInteger(v, 'conflictDensity'), hookDensity: fingerprintCodec.nullableInteger(v, 'hookDensity'), styleSummary: fingerprintCodec.nullableString(v, 'styleSummary'), embeddingId: fingerprintCodec.nullableString(v, 'embeddingId'), createdAt: fingerprintCodec.string(v, 'createdAt') }
}

function emptyRun(): RunState {
  return { exists: false, id: '', projectId: '', chapterId: '', autonomousRunId: null, writingJobId: null, status: 'pending', trigger: '', errorMessage: null, startedAt: null, finishedAt: null, createdAt: '', updatedAt: '' }
}

function emptySuggestion(): SuggestionState {
  return { exists: false, id: '', projectId: '', chapterId: '', runId: null, autonomousRunId: null, writingJobId: null, suggestionType: 'fact_triple', payload: '', confidence: 70, status: 'pending', reason: null, createdAt: '', updatedAt: '' }
}

function emptyFingerprint(): FingerprintState {
  return { exists: false, id: '', projectId: '', chapterId: '', sceneId: null, scope: 'chapter', sentenceLengthAvg: null, dialogueRatio: null, emotionDensity: null, conflictDensity: null, hookDensity: null, styleSummary: null, embeddingId: null, createdAt: '' }
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, eventType: string, payload: JsonObject, result: TResult, occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events: [pendingEvent(eventType, payload, command, occurredAt)] }], result }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  return { aggregateType: command.aggregateType, aggregateId: command.aggregateId, projectId: command.projectId }
}
