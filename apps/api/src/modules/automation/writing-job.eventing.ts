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
import { writingJobs, writingJobSteps } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { PROJECT_AGGREGATE_TYPE, PROJECT_DELETED, projectAggregate } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const WRITING_JOB_AGGREGATE_TYPE = 'WritingJob'
export const WRITING_JOB_PROJECTION = 'writing-jobs'

export const CREATE_WRITING_JOB_COMMAND = 'CreateWritingJob'
export const CHANGE_WRITING_JOB_COMMAND = 'ChangeWritingJob'
export const DELETE_WRITING_JOB_COMMAND = 'DeleteWritingJob'
export const REPLACE_WRITING_JOB_STEPS_COMMAND = 'ReplaceWritingJobSteps'
export const CHANGE_WRITING_JOB_STEP_COMMAND = 'ChangeWritingJobStep'

export const WRITING_JOB_CREATED = 'WritingJobCreated'
export const WRITING_JOB_CHANGED = 'WritingJobChanged'
export const WRITING_JOB_DELETED = 'WritingJobDeleted'
export const WRITING_JOB_STEPS_REPLACED = 'WritingJobStepsReplaced'
export const WRITING_JOB_STEP_CHANGED = 'WritingJobStepChanged'

const JOB_MODES = ['outline_only', 'draft_only', 'outline_then_draft', 'scene_draft'] as const
const JOB_STATUSES = ['idle', 'running', 'paused', 'completed', 'failed', 'isolated'] as const
const STEP_TYPES = [
  'prepare_context',
  'generate_plan',
  'validate_plan',
  'generate_draft',
  'generate_scene_draft',
  'postprocess',
  'classify_suggestions',
  'apply_suggestions',
  'update_health',
  'build_change_set',
  'evaluate_change_set',
  'apply_change_set',
  'auto_repair',
  'done',
] as const
const STEP_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const
const AUTO_DECISIONS = ['approved', 'paused', 'rejected', 'not_applicable', 'medium_risk_repair', 'repaired', 'isolated', 'skipped', 'failed'] as const
const RISK_LEVELS = ['none', 'low', 'medium', 'high', 'critical'] as const
const payloadCodec = createPayloadCodec('INVALID_WRITING_JOB', 'Writing job payload')

export type WritingJobSnapshot = JsonObject & {
  id: string
  projectId: string
  currentChapterId: string | null
  sceneId: string | null
  mode: typeof JOB_MODES[number]
  status: typeof JOB_STATUSES[number]
  executionMode: 'auto'
  autoStopReason: string | null
  autoApprovedSteps: number
  targetWords: number | null
  lastError: string | null
  autonomousRunId: string | null
  createdAt: string
  updatedAt: string
}

export type WritingJobStepSnapshot = JsonObject & {
  id: string
  jobId: string
  stepType: typeof STEP_TYPES[number]
  status: typeof STEP_STATUSES[number]
  autoDecision: typeof AUTO_DECISIONS[number] | null
  autoRiskLevel: typeof RISK_LEVELS[number] | null
  autoDecisionReason: string | null
  autoDecisionReport: unknown
  input: string | null
  output: string | null
  error: string | null
  changeSetId: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

interface WritingJobState extends WritingJobSnapshot {
  exists: boolean
  deleted: boolean
  steps: Record<string, WritingJobStepSnapshot>
}

export interface WritingJobEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const writingJobAggregate: AggregateDefinition<WritingJobState> = {
  aggregateType: WRITING_JOB_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({
    exists: false,
    deleted: false,
    id: '',
    projectId: '',
    currentChapterId: null,
    sceneId: null,
    mode: 'outline_only',
    status: 'idle',
    executionMode: 'auto',
    autoStopReason: null,
    autoApprovedSteps: 0,
    targetWords: null,
    lastError: null,
    autonomousRunId: null,
    createdAt: '',
    updatedAt: '',
    steps: {},
  }),
  evolve: (state, event) => {
    if (event.eventType === WRITING_JOB_CREATED || event.eventType === WRITING_JOB_CHANGED)
      return { ...state, ...readJob(event.payload), exists: true, deleted: false }
    if (event.eventType === WRITING_JOB_DELETED)
      return { ...state, deleted: true }
    if (event.eventType === WRITING_JOB_STEPS_REPLACED) {
      const steps = readSteps(event.payload)
      return { ...state, steps: Object.fromEntries(steps.map(step => [step.id, step])) }
    }
    if (event.eventType === WRITING_JOB_STEP_CHANGED) {
      const step = readStep(event.payload)
      return { ...state, steps: { ...state.steps, [step.id]: step } }
    }
    return state
  },
}

export function registerWritingJobEventing(runtime: WritingJobEventingRuntime): void {
  for (const eventType of [WRITING_JOB_CREATED, WRITING_JOB_CHANGED]) {
    runtime.events.register({
      eventType,
      currentSchemaVersion: 1,
      upcasters: {},
      validate: payload => ({ job: readJob(payloadCodec.object(payload)) }),
    })
  }
  runtime.events.register({ eventType: WRITING_JOB_DELETED, currentSchemaVersion: 1, upcasters: {}, validate: validateDeleted })
  runtime.events.register({ eventType: WRITING_JOB_STEPS_REPLACED, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ steps: readSteps(payloadCodec.object(payload)) }) })
  runtime.events.register({ eventType: WRITING_JOB_STEP_CHANGED, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ step: readStep(payloadCodec.object(payload)) }) })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: WritingJobEventingRuntime): void {
  runtime.commands.register(CREATE_WRITING_JOB_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, writingJobAggregate, stream(command))
    if (loaded.state.exists && !loaded.state.deleted)
      throw new DomainCommandError('WRITING_JOB_ALREADY_EXISTS', 'Writing job already exists')
    await assertTargets(runtime, context.session, command.projectId!, command.payload)
    const timestamp = now()
    const job = createJob(command, timestamp)
    const steps = createSteps(command, timestamp)
    return decision(loaded.version, command, [
      pendingEvent(WRITING_JOB_CREATED, { job }, command, timestamp),
      pendingEvent(WRITING_JOB_STEPS_REPLACED, { steps }, command, timestamp),
    ], { ...job, steps }, timestamp)
  })
  runtime.commands.register(CHANGE_WRITING_JOB_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    await assertTargets(runtime, context.session, command.projectId!, command.payload)
    const timestamp = now()
    const job = changeJob(loaded.state, command.payload, timestamp)
    return decision(loaded.version, command, [pendingEvent(WRITING_JOB_CHANGED, { job }, command, timestamp)], job, timestamp)
  })
  runtime.commands.register(DELETE_WRITING_JOB_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const timestamp = now()
    const job = jobResult(loaded.state)
    return decision(loaded.version, command, [pendingEvent(WRITING_JOB_DELETED, { job, deletedAt: timestamp }, command, timestamp)], job, timestamp)
  })
  runtime.commands.register(REPLACE_WRITING_JOB_STEPS_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const timestamp = now()
    const steps = createSteps(command, timestamp)
    return decision(loaded.version, command, [pendingEvent(WRITING_JOB_STEPS_REPLACED, { steps }, command, timestamp)], { steps }, timestamp)
  })
  runtime.commands.register(CHANGE_WRITING_JOB_STEP_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = payloadCodec.string(command.payload, 'id')
    const current = loaded.state.steps[id]
    if (!current)
      throw new DomainCommandError('WRITING_JOB_STEP_NOT_FOUND', 'Writing job step not found')
    const timestamp = now()
    const step = changeStep(current, command.payload, timestamp)
    return decision(loaded.version, command, [pendingEvent(WRITING_JOB_STEP_CHANGED, { step }, command, timestamp)], step, timestamp)
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: WRITING_JOB_PROJECTION,
    mode: 'sync',
    handles: [WRITING_JOB_CREATED, WRITING_JOB_CHANGED, WRITING_JOB_DELETED, WRITING_JOB_STEPS_REPLACED, WRITING_JOB_STEP_CHANGED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await resetProjection(transaction, event.aggregateId)
        return
      }
      if (event.eventType === WRITING_JOB_CREATED) {
        await transaction.insert(writingJobs).values(readJob(event.payload))
        return
      }
      if (event.eventType === WRITING_JOB_CHANGED) {
        const job = readJob(event.payload)
        await transaction.update(writingJobs).set(job).where(and(eq(writingJobs.id, job.id), eq(writingJobs.projectId, job.projectId)))
        return
      }
      if (event.eventType === WRITING_JOB_DELETED) {
        const { job } = readDeleted(event.payload)
        await transaction.delete(writingJobSteps).where(eq(writingJobSteps.jobId, job.id))
        await transaction.delete(writingJobs).where(and(eq(writingJobs.id, job.id), eq(writingJobs.projectId, job.projectId)))
        return
      }
      if (event.eventType === WRITING_JOB_STEPS_REPLACED) {
        const steps = readSteps(event.payload)
        await transaction.delete(writingJobSteps).where(eq(writingJobSteps.jobId, event.aggregateId))
        if (steps.length)
          await transaction.insert(writingJobSteps).values(steps)
        return
      }
      const step = readStep(event.payload)
      await transaction.update(writingJobSteps).set(step).where(and(eq(writingJobSteps.id, step.id), eq(writingJobSteps.jobId, step.jobId)))
    },
    reset: resetProjection,
  })
}

async function resetProjection(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  if (projectId) {
    const jobs = await transaction.select({ id: writingJobs.id }).from(writingJobs).where(eq(writingJobs.projectId, projectId))
    for (const job of jobs)
      await transaction.delete(writingJobSteps).where(eq(writingJobSteps.jobId, job.id))
    await transaction.delete(writingJobs).where(eq(writingJobs.projectId, projectId))
    return
  }
  await transaction.delete(writingJobSteps)
  await transaction.delete(writingJobs)
}

async function assertActiveProject(runtime: WritingJobEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  if (!command.projectId || command.aggregateType !== WRITING_JOB_AGGREGATE_TYPE)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Writing job command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, { aggregateType: PROJECT_AGGREGATE_TYPE, aggregateId: command.projectId, projectId: command.projectId })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function loadActive(runtime: WritingJobEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(session, writingJobAggregate, stream(command))
  if (!loaded.state.exists || loaded.state.deleted)
    throw new DomainCommandError('WRITING_JOB_NOT_FOUND', 'Writing job not found')
  return loaded
}

async function assertTargets(runtime: WritingJobEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, payload: JsonObject) {
  if (!('currentChapterId' in payload))
    return
  const chapterId = payloadCodec.nullableString(payload, 'currentChapterId')
  if (!chapterId) {
    if ('sceneId' in payload && payloadCodec.nullableString(payload, 'sceneId'))
      throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Scene requires a chapter')
    return
  }
  const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, { aggregateType: CHAPTER_AGGREGATE_TYPE, aggregateId: chapterId, projectId })
  if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
    throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
  const sceneId = payloadCodec.nullableString(payload, 'sceneId')
  if (sceneId && (!chapter.state.scenes[sceneId] || chapter.state.scenes[sceneId].deleted))
    throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
}

function createJob(command: CommandEnvelope, timestamp: string): WritingJobSnapshot {
  return {
    id: command.aggregateId,
    projectId: command.projectId!,
    currentChapterId: payloadCodec.nullableString(command.payload, 'currentChapterId'),
    sceneId: payloadCodec.nullableString(command.payload, 'sceneId'),
    mode: payloadCodec.enum(command.payload, 'mode', JOB_MODES),
    status: 'status' in command.payload ? payloadCodec.enum(command.payload, 'status', JOB_STATUSES) : 'idle',
    executionMode: 'auto',
    autoStopReason: payloadCodec.nullableString(command.payload, 'autoStopReason'),
    autoApprovedSteps: 'autoApprovedSteps' in command.payload ? payloadCodec.integer(command.payload, 'autoApprovedSteps') : 0,
    targetWords: payloadCodec.nullableInteger(command.payload, 'targetWords'),
    lastError: payloadCodec.nullableString(command.payload, 'lastError'),
    autonomousRunId: payloadCodec.nullableString(command.payload, 'autonomousRunId'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeJob(current: WritingJobSnapshot, payload: JsonObject, timestamp: string): WritingJobSnapshot {
  return {
    ...current,
    currentChapterId: payloadCodec.nextNullableString(payload, 'currentChapterId', current.currentChapterId),
    sceneId: payloadCodec.nextNullableString(payload, 'sceneId', current.sceneId),
    mode: 'mode' in payload ? payloadCodec.enum(payload, 'mode', JOB_MODES) : current.mode,
    status: 'status' in payload ? payloadCodec.enum(payload, 'status', JOB_STATUSES) : current.status,
    autoStopReason: payloadCodec.nextNullableString(payload, 'autoStopReason', current.autoStopReason),
    autoApprovedSteps: 'autoApprovedSteps' in payload ? payloadCodec.integer(payload, 'autoApprovedSteps') : current.autoApprovedSteps,
    targetWords: 'targetWords' in payload ? payloadCodec.nullableInteger(payload, 'targetWords') : current.targetWords,
    lastError: payloadCodec.nextNullableString(payload, 'lastError', current.lastError),
    autonomousRunId: payloadCodec.nextNullableString(payload, 'autonomousRunId', current.autonomousRunId),
    updatedAt: timestamp,
  }
}

function createSteps(command: CommandEnvelope, timestamp: string): WritingJobStepSnapshot[] {
  const steps = payloadCodec.objectArray(command.payload, 'steps').map(step => createStep(command.aggregateId, step, timestamp))
  const ids = steps.map(step => step.id)
  if (new Set(ids).size !== ids.length)
    throw new DomainCommandError('INVALID_WRITING_JOB', 'Writing job step ids must be unique')
  return steps
}

function createStep(jobId: string, payload: JsonObject, timestamp: string): WritingJobStepSnapshot {
  return {
    id: payloadCodec.string(payload, 'id'),
    jobId,
    stepType: payloadCodec.enum(payload, 'stepType', STEP_TYPES),
    status: 'status' in payload ? payloadCodec.enum(payload, 'status', STEP_STATUSES) : 'pending',
    autoDecision: payloadCodec.nullableEnum(payload, 'autoDecision', AUTO_DECISIONS),
    autoRiskLevel: payloadCodec.nullableEnum(payload, 'autoRiskLevel', RISK_LEVELS),
    autoDecisionReason: payloadCodec.nullableString(payload, 'autoDecisionReason'),
    autoDecisionReport: payload.autoDecisionReport ?? null,
    input: payloadCodec.nullableString(payload, 'input'),
    output: payloadCodec.nullableString(payload, 'output'),
    error: payloadCodec.nullableString(payload, 'error'),
    changeSetId: payloadCodec.nullableString(payload, 'changeSetId'),
    startedAt: payloadCodec.nullableString(payload, 'startedAt'),
    finishedAt: payloadCodec.nullableString(payload, 'finishedAt'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function changeStep(current: WritingJobStepSnapshot, payload: JsonObject, timestamp: string): WritingJobStepSnapshot {
  return {
    ...current,
    stepType: 'stepType' in payload ? payloadCodec.enum(payload, 'stepType', STEP_TYPES) : current.stepType,
    status: 'status' in payload ? payloadCodec.enum(payload, 'status', STEP_STATUSES) : current.status,
    autoDecision: 'autoDecision' in payload ? payloadCodec.nullableEnum(payload, 'autoDecision', AUTO_DECISIONS) : current.autoDecision,
    autoRiskLevel: 'autoRiskLevel' in payload ? payloadCodec.nullableEnum(payload, 'autoRiskLevel', RISK_LEVELS) : current.autoRiskLevel,
    autoDecisionReason: payloadCodec.nextNullableString(payload, 'autoDecisionReason', current.autoDecisionReason),
    autoDecisionReport: 'autoDecisionReport' in payload ? payload.autoDecisionReport : current.autoDecisionReport,
    input: payloadCodec.nextNullableString(payload, 'input', current.input),
    output: payloadCodec.nextNullableString(payload, 'output', current.output),
    error: payloadCodec.nextNullableString(payload, 'error', current.error),
    changeSetId: payloadCodec.nextNullableString(payload, 'changeSetId', current.changeSetId),
    startedAt: payloadCodec.nextNullableString(payload, 'startedAt', current.startedAt),
    finishedAt: payloadCodec.nextNullableString(payload, 'finishedAt', current.finishedAt),
    updatedAt: timestamp,
  }
}

function readJob(payload: JsonObject): WritingJobSnapshot {
  const value = 'job' in payload ? payloadCodec.object(payload.job) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    projectId: payloadCodec.string(value, 'projectId'),
    currentChapterId: payloadCodec.nullableString(value, 'currentChapterId'),
    sceneId: payloadCodec.nullableString(value, 'sceneId'),
    mode: payloadCodec.enum(value, 'mode', JOB_MODES),
    status: payloadCodec.enum(value, 'status', JOB_STATUSES),
    executionMode: payloadCodec.enum(value, 'executionMode', ['auto'] as const),
    autoStopReason: payloadCodec.nullableString(value, 'autoStopReason'),
    autoApprovedSteps: payloadCodec.integer(value, 'autoApprovedSteps'),
    targetWords: payloadCodec.nullableInteger(value, 'targetWords'),
    lastError: payloadCodec.nullableString(value, 'lastError'),
    autonomousRunId: payloadCodec.nullableString(value, 'autonomousRunId'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function readSteps(payload: JsonObject): WritingJobStepSnapshot[] {
  return payloadCodec.objectArray(payload, 'steps').map(value => readStep(value))
}

function readStep(payload: JsonObject): WritingJobStepSnapshot {
  const value = 'step' in payload ? payloadCodec.object(payload.step) : payload
  return {
    id: payloadCodec.string(value, 'id'),
    jobId: payloadCodec.string(value, 'jobId'),
    stepType: payloadCodec.enum(value, 'stepType', STEP_TYPES),
    status: payloadCodec.enum(value, 'status', STEP_STATUSES),
    autoDecision: payloadCodec.nullableEnum(value, 'autoDecision', AUTO_DECISIONS),
    autoRiskLevel: payloadCodec.nullableEnum(value, 'autoRiskLevel', RISK_LEVELS),
    autoDecisionReason: payloadCodec.nullableString(value, 'autoDecisionReason'),
    autoDecisionReport: value.autoDecisionReport ?? null,
    input: payloadCodec.nullableString(value, 'input'),
    output: payloadCodec.nullableString(value, 'output'),
    error: payloadCodec.nullableString(value, 'error'),
    changeSetId: payloadCodec.nullableString(value, 'changeSetId'),
    startedAt: payloadCodec.nullableString(value, 'startedAt'),
    finishedAt: payloadCodec.nullableString(value, 'finishedAt'),
    createdAt: payloadCodec.string(value, 'createdAt'),
    updatedAt: payloadCodec.string(value, 'updatedAt'),
  }
}

function validateDeleted(payload: unknown): JsonObject {
  const value = payloadCodec.object(payload)
  return { job: readJob(payloadCodec.object(value.job)), deletedAt: payloadCodec.string(value, 'deletedAt') }
}

function readDeleted(payload: JsonObject) {
  const value = validateDeleted(payload)
  return { job: readJob(payloadCodec.object(value.job)), deletedAt: payloadCodec.string(value, 'deletedAt') }
}

function jobResult(state: WritingJobState): WritingJobSnapshot {
  const { exists: _exists, deleted: _deleted, steps: _steps, ...job } = state
  return job
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, events: PendingEvent[], result: TResult, _occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events }], result }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  return { aggregateType: WRITING_JOB_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}
