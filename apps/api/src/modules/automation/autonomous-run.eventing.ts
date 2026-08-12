import type { AggregateDefinition, AggregateRepository, CommandBus, CommandEnvelope, EventRegistry, JsonObject, PendingEvent, ProjectionRegistry, StreamRef } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { autonomousRunExceptions, autonomousRunJobs, autonomousWritingRuns } from '../../db/schema'
import { createPayloadCodec, DomainCommandError } from '../../eventing'
import { generateId, now } from '../../shared/utils'
import { PROJECT_AGGREGATE_TYPE, PROJECT_DELETED, projectAggregate } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, chapterAggregate } from '../story/chapter.eventing'

export const AUTONOMOUS_RUN_AGGREGATE_TYPE = 'AutonomousRun'
export const AUTONOMOUS_RUN_PROJECTION = 'autonomous-runs'
export const PREPARE_AUTONOMOUS_RUN_COMMAND = 'PrepareAutonomousRun'
export const CHANGE_AUTONOMOUS_RUN_COMMAND = 'ChangeAutonomousRun'
export const ADD_AUTONOMOUS_RUN_JOB_COMMAND = 'AddAutonomousRunJob'
export const CHANGE_AUTONOMOUS_RUN_JOB_COMMAND = 'ChangeAutonomousRunJob'
export const OPEN_AUTONOMOUS_EXCEPTION_COMMAND = 'OpenAutonomousException'
export const CHANGE_AUTONOMOUS_EXCEPTION_COMMAND = 'ChangeAutonomousException'
export const REQUEST_AUTONOMOUS_RUN_EXECUTION_COMMAND = 'RequestAutonomousRunExecution'
export const RESOLVE_AUTONOMOUS_EXCEPTION_ACTION_COMMAND = 'ResolveAutonomousExceptionAction'

export const AUTONOMOUS_RUN_PREPARED = 'AutonomousRunPrepared'
export const AUTONOMOUS_RUN_CHANGED = 'AutonomousRunChanged'
export const AUTONOMOUS_RUN_JOB_ADDED = 'AutonomousRunJobAdded'
export const AUTONOMOUS_RUN_JOB_CHANGED = 'AutonomousRunJobChanged'
export const AUTONOMOUS_EXCEPTION_OPENED = 'AutonomousExceptionOpened'
export const AUTONOMOUS_EXCEPTION_CHANGED = 'AutonomousExceptionChanged'
export const AUTONOMOUS_RUN_EXECUTION_REQUESTED = 'AutonomousRunExecutionRequested'
export const AUTONOMOUS_EXCEPTION_ACTION_RESOLVED = 'AutonomousExceptionActionResolved'
export const AUTONOMOUS_RUN_OUTBOX_HANDLER = 'autonomous-run.execute'

const RUN_STATUSES = ['idle', 'running', 'pausing', 'paused', 'abandoning', 'completed', 'failed', 'abandoned'] as const
const STRATEGIES = ['safe', 'balanced', 'fast'] as const
const SCOPES = ['project', 'volume', 'chapter_range', 'next_n_chapters', 'from_current_forward', 'continue_incomplete', 'rewrite_selected'] as const
const JOB_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped', 'isolated'] as const
const EXCEPTION_TYPES = ['consistency_blocked', 'high_risk_change_set', 'apply_failed', 'ai_failed', 'health_regression', 'operator_override_required'] as const
const SEVERITIES = ['medium', 'high', 'critical'] as const
const EXCEPTION_STATUSES = ['open', 'resolved', 'ignored', 'auto_resolved', 'isolated', 'resolved_by_user'] as const
const RESOLUTION_STRATEGIES = ['repair', 'skip_chapter', 'isolate_chapter', 'retry', 'stop_run'] as const
const codec = createPayloadCodec('INVALID_AUTONOMOUS_RUN', 'Autonomous run payload')

export type AutonomousRunSnapshot = JsonObject & {
  id: string
  projectId: string
  status: typeof RUN_STATUSES[number]
  strategy: typeof STRATEGIES[number]
  scopeType: typeof SCOPES[number]
  volumeId: string | null
  startChapterId: string | null
  endChapterId: string | null
  targetChapterCount: number | null
  targetWordsPerChapter: number
  currentChapterId: string | null
  completedChapterCount: number
  failedChapterCount: number
  pausedReason: string | null
  lastError: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AutonomousRunJobSnapshot = JsonObject & {
  id: string
  runId: string
  projectId: string
  writingJobId: string
  chapterId: string | null
  sceneId: string | null
  status: typeof JOB_STATUSES[number]
  orderIndex: number
  isolationReason: string | null
  isolationReport: unknown
  createdAt: string
  updatedAt: string
}

export type AutonomousExceptionSnapshot = JsonObject & {
  id: string
  runId: string
  projectId: string
  chapterId: string | null
  changeSetId: string | null
  writingJobId: string | null
  stepId: string | null
  exceptionType: typeof EXCEPTION_TYPES[number]
  severity: typeof SEVERITIES[number]
  title: string
  description: string | null
  status: typeof EXCEPTION_STATUSES[number]
  autoResolutionStrategy: typeof RESOLUTION_STRATEGIES[number] | null
  resolution: string | null
  resolutionReport: unknown
  createdAt: string
  updatedAt: string
}

interface AutonomousRunState extends AutonomousRunSnapshot {
  exists: boolean
  jobs: Record<string, AutonomousRunJobSnapshot>
  exceptions: Record<string, AutonomousExceptionSnapshot>
}

export interface AutonomousRunEventingRuntime {
  aggregates: AggregateRepository
  commands: CommandBus
  events: EventRegistry
  projections: ProjectionRegistry
}

export const autonomousRunAggregate: AggregateDefinition<AutonomousRunState> = {
  aggregateType: AUTONOMOUS_RUN_AGGREGATE_TYPE,
  snapshotEvery: 100,
  snapshotSchemaVersion: 1,
  initialState: () => ({ exists: false, id: '', projectId: '', status: 'idle', strategy: 'balanced', scopeType: 'project', volumeId: null, startChapterId: null, endChapterId: null, targetChapterCount: null, targetWordsPerChapter: 3000, currentChapterId: null, completedChapterCount: 0, failedChapterCount: 0, pausedReason: null, lastError: null, startedAt: null, finishedAt: null, createdAt: '', updatedAt: '', jobs: {}, exceptions: {} }),
  evolve: (state, event) => {
    if (event.eventType === AUTONOMOUS_RUN_PREPARED || event.eventType === AUTONOMOUS_RUN_CHANGED)
      return { ...state, ...readRun(event.payload), exists: true }
    if (event.eventType === AUTONOMOUS_RUN_JOB_ADDED || event.eventType === AUTONOMOUS_RUN_JOB_CHANGED) {
      const job = readJob(event.payload)
      return { ...state, jobs: { ...state.jobs, [job.id]: job } }
    }
    if (event.eventType === AUTONOMOUS_EXCEPTION_OPENED || event.eventType === AUTONOMOUS_EXCEPTION_CHANGED || event.eventType === AUTONOMOUS_EXCEPTION_ACTION_RESOLVED) {
      const exception = readException(event.payload)
      return { ...state, exceptions: { ...state.exceptions, [exception.id]: exception } }
    }
    return state
  },
}

export function registerAutonomousRunEventing(runtime: AutonomousRunEventingRuntime): void {
  for (const eventType of [AUTONOMOUS_RUN_PREPARED, AUTONOMOUS_RUN_CHANGED])
    runtime.events.register({ eventType, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ run: readRun(codec.object(payload)) }) })
  for (const eventType of [AUTONOMOUS_RUN_JOB_ADDED, AUTONOMOUS_RUN_JOB_CHANGED])
    runtime.events.register({ eventType, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ job: readJob(codec.object(payload)) }) })
  for (const eventType of [AUTONOMOUS_EXCEPTION_OPENED, AUTONOMOUS_EXCEPTION_CHANGED])
    runtime.events.register({ eventType, currentSchemaVersion: 1, upcasters: {}, validate: payload => ({ exception: readException(codec.object(payload)) }) })
  runtime.events.register({
    eventType: AUTONOMOUS_EXCEPTION_ACTION_RESOLVED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: (payload) => {
      const value = codec.object(payload)
      return {
        exception: readException(codec.object(value.exception)),
        action: codec.enum(value, 'action', ['retry_step', 'skip_chapter', 'isolate_chapter', 'stop_run'] as const),
      }
    },
  })
  runtime.events.register({
    eventType: AUTONOMOUS_RUN_EXECUTION_REQUESTED,
    currentSchemaVersion: 1,
    upcasters: {},
    validate: payload => ({ requestId: codec.string(codec.object(payload), 'requestId') }),
  })
  registerCommands(runtime)
  registerProjection(runtime.projections)
}

function registerCommands(runtime: AutonomousRunEventingRuntime): void {
  runtime.commands.register(PREPARE_AUTONOMOUS_RUN_COMMAND, async (command, context) => {
    await assertActiveProject(runtime, command, context.session)
    const loaded = await runtime.aggregates.loadInSession(context.session, autonomousRunAggregate, stream(command))
    if (loaded.state.exists)
      throw new DomainCommandError('AUTONOMOUS_RUN_ALREADY_EXISTS', 'Autonomous run already exists')
    await assertChapterRefs(runtime, context.session, command.projectId!, command.payload)
    const timestamp = now()
    const run = createRun(command, timestamp)
    return decision(loaded.version, command, AUTONOMOUS_RUN_PREPARED, { run }, run, timestamp)
  })
  runtime.commands.register(CHANGE_AUTONOMOUS_RUN_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    await assertChapterRefs(runtime, context.session, command.projectId!, command.payload)
    const timestamp = now()
    const run = changeRun(loaded.state, command.payload, timestamp)
    return decision(loaded.version, command, AUTONOMOUS_RUN_CHANGED, { run }, run, timestamp)
  })
  runtime.commands.register(REQUEST_AUTONOMOUS_RUN_EXECUTION_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    if (loaded.state.status !== 'running')
      throw new DomainCommandError('AUTONOMOUS_RUN_NOT_RUNNING', 'Autonomous run must be running before execution is requested')
    const timestamp = now()
    const requestId = command.commandId
    const event = pendingEvent(AUTONOMOUS_RUN_EXECUTION_REQUESTED, { requestId }, command, timestamp)
    return {
      streams: [{ stream: stream(command), expectedVersion: loaded.version, events: [event] }],
      result: { requestId },
      outbox: [{
        id: `outbox:${requestId}`,
        eventId: event.eventId,
        handlerName: AUTONOMOUS_RUN_OUTBOX_HANDLER,
        payload: { projectId: command.projectId!, runId: command.aggregateId },
      }],
    }
  })
  runtime.commands.register(ADD_AUTONOMOUS_RUN_JOB_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = codec.string(command.payload, 'id')
    if (loaded.state.jobs[id])
      throw new DomainCommandError('AUTONOMOUS_RUN_JOB_ALREADY_EXISTS', 'Autonomous run job already exists')
    await assertChapterRefs(runtime, context.session, command.projectId!, command.payload)
    const timestamp = now()
    const job = createJob(command, timestamp)
    return decision(loaded.version, command, AUTONOMOUS_RUN_JOB_ADDED, { job }, job, timestamp)
  })
  runtime.commands.register(CHANGE_AUTONOMOUS_RUN_JOB_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = codec.string(command.payload, 'id')
    const current = loaded.state.jobs[id]
    if (!current)
      throw new DomainCommandError('AUTONOMOUS_RUN_JOB_NOT_FOUND', 'Autonomous run job not found')
    const timestamp = now()
    const job = changeJob(current, command.payload, timestamp)
    return decision(loaded.version, command, AUTONOMOUS_RUN_JOB_CHANGED, { job }, job, timestamp)
  })
  runtime.commands.register(OPEN_AUTONOMOUS_EXCEPTION_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = codec.string(command.payload, 'id')
    if (loaded.state.exceptions[id])
      throw new DomainCommandError('AUTONOMOUS_EXCEPTION_ALREADY_EXISTS', 'Autonomous exception already exists')
    await assertChapterRefs(runtime, context.session, command.projectId!, command.payload)
    const timestamp = now()
    const exception = createException(command, timestamp)
    return decision(loaded.version, command, AUTONOMOUS_EXCEPTION_OPENED, { exception }, exception, timestamp)
  })
  runtime.commands.register(CHANGE_AUTONOMOUS_EXCEPTION_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = codec.string(command.payload, 'id')
    const current = loaded.state.exceptions[id]
    if (!current)
      throw new DomainCommandError('AUTONOMOUS_EXCEPTION_NOT_FOUND', 'Autonomous exception not found')
    const timestamp = now()
    const exception = changeException(current, command.payload, timestamp)
    return decision(loaded.version, command, AUTONOMOUS_EXCEPTION_CHANGED, { exception }, exception, timestamp)
  })
  runtime.commands.register(RESOLVE_AUTONOMOUS_EXCEPTION_ACTION_COMMAND, async (command, context) => {
    const loaded = await loadActive(runtime, command, context.session)
    const id = codec.string(command.payload, 'id')
    const current = loaded.state.exceptions[id]
    if (!current)
      throw new DomainCommandError('AUTONOMOUS_EXCEPTION_NOT_FOUND', 'Autonomous exception not found')
    if (current.status !== 'open')
      throw new DomainCommandError('AUTONOMOUS_EXCEPTION_ALREADY_RESOLVED', 'Autonomous exception is already resolved')
    const action = codec.enum(command.payload, 'action', ['retry_step', 'skip_chapter', 'isolate_chapter', 'stop_run'] as const)
    const timestamp = now()
    const exception = changeException(current, {
      status: action === 'isolate_chapter' ? 'isolated' : 'resolved_by_user',
      autoResolutionStrategy: action === 'retry_step' ? 'retry' : action,
      resolution: codec.string(command.payload, 'resolution'),
    }, timestamp)
    return decision(loaded.version, command, AUTONOMOUS_EXCEPTION_ACTION_RESOLVED, { exception, action }, exception, timestamp)
  })
}

function registerProjection(projections: ProjectionRegistry): void {
  projections.register({
    name: AUTONOMOUS_RUN_PROJECTION,
    mode: 'sync',
    handles: [AUTONOMOUS_RUN_PREPARED, AUTONOMOUS_RUN_CHANGED, AUTONOMOUS_RUN_JOB_ADDED, AUTONOMOUS_RUN_JOB_CHANGED, AUTONOMOUS_EXCEPTION_OPENED, AUTONOMOUS_EXCEPTION_CHANGED, AUTONOMOUS_EXCEPTION_ACTION_RESOLVED, PROJECT_DELETED],
    project: async (transaction, event) => {
      if (event.eventType === PROJECT_DELETED) {
        await resetProjection(transaction, event.aggregateId)
        return
      }
      if (event.eventType === AUTONOMOUS_RUN_PREPARED) {
        await transaction.insert(autonomousWritingRuns).values(readRun(event.payload))
        return
      }
      if (event.eventType === AUTONOMOUS_RUN_CHANGED) {
        const run = readRun(event.payload)
        await transaction.update(autonomousWritingRuns).set(run).where(and(eq(autonomousWritingRuns.id, run.id), eq(autonomousWritingRuns.projectId, run.projectId)))
        return
      }
      if (event.eventType === AUTONOMOUS_RUN_JOB_ADDED) {
        await transaction.insert(autonomousRunJobs).values(readJob(event.payload))
        return
      }
      if (event.eventType === AUTONOMOUS_RUN_JOB_CHANGED) {
        const job = readJob(event.payload)
        await transaction.update(autonomousRunJobs).set(job).where(and(eq(autonomousRunJobs.id, job.id), eq(autonomousRunJobs.projectId, job.projectId)))
        return
      }
      if (event.eventType === AUTONOMOUS_EXCEPTION_OPENED) {
        await transaction.insert(autonomousRunExceptions).values(readException(event.payload))
        return
      }
      const exception = readException(event.payload)
      await transaction.update(autonomousRunExceptions).set(exception).where(and(eq(autonomousRunExceptions.id, exception.id), eq(autonomousRunExceptions.projectId, exception.projectId)))
    },
    reset: resetProjection,
  })
}

async function resetProjection(transaction: Parameters<ProjectionRegistry['projectSync']>[0], projectId?: string) {
  if (projectId) {
    await transaction.delete(autonomousRunExceptions).where(eq(autonomousRunExceptions.projectId, projectId))
    await transaction.delete(autonomousRunJobs).where(eq(autonomousRunJobs.projectId, projectId))
    await transaction.delete(autonomousWritingRuns).where(eq(autonomousWritingRuns.projectId, projectId))
    return
  }
  await transaction.delete(autonomousRunExceptions)
  await transaction.delete(autonomousRunJobs)
  await transaction.delete(autonomousWritingRuns)
}

async function assertActiveProject(runtime: AutonomousRunEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  if (!command.projectId || command.aggregateType !== AUTONOMOUS_RUN_AGGREGATE_TYPE)
    throw new DomainCommandError('PROJECT_SCOPE_MISMATCH', 'Autonomous run command has invalid scope')
  const project = await runtime.aggregates.loadInSession(session, projectAggregate, { aggregateType: PROJECT_AGGREGATE_TYPE, aggregateId: command.projectId, projectId: command.projectId })
  if (!project.state.exists || project.state.deleted)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function loadActive(runtime: AutonomousRunEventingRuntime, command: CommandEnvelope, session: Parameters<AggregateRepository['loadInSession']>[0]) {
  await assertActiveProject(runtime, command, session)
  const loaded = await runtime.aggregates.loadInSession(session, autonomousRunAggregate, stream(command))
  if (!loaded.state.exists)
    throw new DomainCommandError('AUTONOMOUS_RUN_NOT_FOUND', 'Autonomous run not found')
  return loaded
}

async function assertChapterRefs(runtime: AutonomousRunEventingRuntime, session: Parameters<AggregateRepository['loadInSession']>[0], projectId: string, payload: JsonObject) {
  for (const key of ['startChapterId', 'endChapterId', 'currentChapterId', 'chapterId'] as const) {
    if (!(key in payload))
      continue
    const chapterId = codec.nullableString(payload, key)
    if (!chapterId)
      continue
    const chapter = await runtime.aggregates.loadInSession(session, chapterAggregate, { aggregateType: CHAPTER_AGGREGATE_TYPE, aggregateId: chapterId, projectId })
    if (!chapter.state.exists || chapter.state.deleted || chapter.state.projectId !== projectId)
      throw new DomainCommandError('CHAPTER_NOT_FOUND', 'Chapter not found')
    if ('sceneId' in payload) {
      const sceneId = codec.nullableString(payload, 'sceneId')
      if (sceneId && (!chapter.state.scenes[sceneId] || chapter.state.scenes[sceneId].deleted))
        throw new DomainCommandError('SCENE_NOT_FOUND', 'Scene not found')
    }
  }
}

function createRun(command: CommandEnvelope, timestamp: string): AutonomousRunSnapshot {
  return { id: command.aggregateId, projectId: command.projectId!, status: 'idle', strategy: codec.enum(command.payload, 'strategy', STRATEGIES), scopeType: codec.enum(command.payload, 'scopeType', SCOPES), volumeId: codec.nullableString(command.payload, 'volumeId'), startChapterId: codec.nullableString(command.payload, 'startChapterId'), endChapterId: codec.nullableString(command.payload, 'endChapterId'), targetChapterCount: codec.nullableInteger(command.payload, 'targetChapterCount'), targetWordsPerChapter: 'targetWordsPerChapter' in command.payload ? codec.integer(command.payload, 'targetWordsPerChapter') : 3000, currentChapterId: null, completedChapterCount: 0, failedChapterCount: 0, pausedReason: null, lastError: null, startedAt: null, finishedAt: null, createdAt: timestamp, updatedAt: timestamp }
}

function changeRun(current: AutonomousRunSnapshot, payload: JsonObject, timestamp: string): AutonomousRunSnapshot {
  const status = 'status' in payload ? codec.enum(payload, 'status', RUN_STATUSES) : current.status
  assertRunTransition(current.status, status)
  return { ...current, status, strategy: 'strategy' in payload ? codec.enum(payload, 'strategy', STRATEGIES) : current.strategy, targetChapterCount: 'targetChapterCount' in payload ? codec.nullableInteger(payload, 'targetChapterCount') : current.targetChapterCount, currentChapterId: codec.nextNullableString(payload, 'currentChapterId', current.currentChapterId), completedChapterCount: 'completedChapterCount' in payload ? codec.integer(payload, 'completedChapterCount') : current.completedChapterCount, failedChapterCount: 'failedChapterCount' in payload ? codec.integer(payload, 'failedChapterCount') : current.failedChapterCount, pausedReason: codec.nextNullableString(payload, 'pausedReason', current.pausedReason), lastError: codec.nextNullableString(payload, 'lastError', current.lastError), startedAt: codec.nextNullableString(payload, 'startedAt', current.startedAt), finishedAt: codec.nextNullableString(payload, 'finishedAt', current.finishedAt), updatedAt: timestamp }
}

function assertRunTransition(current: AutonomousRunSnapshot['status'], next: AutonomousRunSnapshot['status']): void {
  if (current === next)
    return
  const allowed: Record<AutonomousRunSnapshot['status'], AutonomousRunSnapshot['status'][]> = {
    idle: ['running'],
    running: ['pausing', 'abandoning', 'completed', 'failed'],
    pausing: ['paused', 'abandoning'],
    paused: ['running', 'abandoning'],
    abandoning: ['abandoned'],
    completed: [],
    failed: [],
    abandoned: [],
  }
  if (!allowed[current].includes(next))
    throw new DomainCommandError('INVALID_AUTONOMOUS_RUN_TRANSITION', `Cannot transition autonomous run from ${current} to ${next}`)
}

function createJob(command: CommandEnvelope, timestamp: string): AutonomousRunJobSnapshot {
  return { id: codec.string(command.payload, 'id'), runId: command.aggregateId, projectId: command.projectId!, writingJobId: codec.string(command.payload, 'writingJobId'), chapterId: codec.nullableString(command.payload, 'chapterId'), sceneId: codec.nullableString(command.payload, 'sceneId'), status: 'status' in command.payload ? codec.enum(command.payload, 'status', JOB_STATUSES) : 'pending', orderIndex: codec.integer(command.payload, 'orderIndex'), isolationReason: codec.nullableString(command.payload, 'isolationReason'), isolationReport: command.payload.isolationReport ?? null, createdAt: timestamp, updatedAt: timestamp }
}

function changeJob(current: AutonomousRunJobSnapshot, payload: JsonObject, timestamp: string): AutonomousRunJobSnapshot {
  return { ...current, status: 'status' in payload ? codec.enum(payload, 'status', JOB_STATUSES) : current.status, isolationReason: codec.nextNullableString(payload, 'isolationReason', current.isolationReason), isolationReport: 'isolationReport' in payload ? payload.isolationReport : current.isolationReport, updatedAt: timestamp }
}

function createException(command: CommandEnvelope, timestamp: string): AutonomousExceptionSnapshot {
  return { id: codec.string(command.payload, 'id'), runId: command.aggregateId, projectId: command.projectId!, chapterId: codec.nullableString(command.payload, 'chapterId'), changeSetId: codec.nullableString(command.payload, 'changeSetId'), writingJobId: codec.nullableString(command.payload, 'writingJobId'), stepId: codec.nullableString(command.payload, 'stepId'), exceptionType: codec.enum(command.payload, 'exceptionType', EXCEPTION_TYPES), severity: codec.enum(command.payload, 'severity', SEVERITIES), title: codec.string(command.payload, 'title'), description: codec.nullableString(command.payload, 'description'), status: 'status' in command.payload ? codec.enum(command.payload, 'status', EXCEPTION_STATUSES) : 'open', autoResolutionStrategy: codec.nullableEnum(command.payload, 'autoResolutionStrategy', RESOLUTION_STRATEGIES), resolution: codec.nullableString(command.payload, 'resolution'), resolutionReport: command.payload.resolutionReport ?? null, createdAt: timestamp, updatedAt: timestamp }
}

function changeException(current: AutonomousExceptionSnapshot, payload: JsonObject, timestamp: string): AutonomousExceptionSnapshot {
  return { ...current, status: 'status' in payload ? codec.enum(payload, 'status', EXCEPTION_STATUSES) : current.status, autoResolutionStrategy: 'autoResolutionStrategy' in payload ? codec.nullableEnum(payload, 'autoResolutionStrategy', RESOLUTION_STRATEGIES) : current.autoResolutionStrategy, resolution: codec.nextNullableString(payload, 'resolution', current.resolution), resolutionReport: 'resolutionReport' in payload ? payload.resolutionReport : current.resolutionReport, updatedAt: timestamp }
}

function readRun(payload: JsonObject): AutonomousRunSnapshot {
  const v = 'run' in payload ? codec.object(payload.run) : payload
  return { id: codec.string(v, 'id'), projectId: codec.string(v, 'projectId'), status: codec.enum(v, 'status', RUN_STATUSES), strategy: codec.enum(v, 'strategy', STRATEGIES), scopeType: codec.enum(v, 'scopeType', SCOPES), volumeId: codec.nullableString(v, 'volumeId'), startChapterId: codec.nullableString(v, 'startChapterId'), endChapterId: codec.nullableString(v, 'endChapterId'), targetChapterCount: codec.nullableInteger(v, 'targetChapterCount'), targetWordsPerChapter: codec.integer(v, 'targetWordsPerChapter'), currentChapterId: codec.nullableString(v, 'currentChapterId'), completedChapterCount: codec.integer(v, 'completedChapterCount'), failedChapterCount: codec.integer(v, 'failedChapterCount'), pausedReason: codec.nullableString(v, 'pausedReason'), lastError: codec.nullableString(v, 'lastError'), startedAt: codec.nullableString(v, 'startedAt'), finishedAt: codec.nullableString(v, 'finishedAt'), createdAt: codec.string(v, 'createdAt'), updatedAt: codec.string(v, 'updatedAt') }
}

function readJob(payload: JsonObject): AutonomousRunJobSnapshot {
  const v = 'job' in payload ? codec.object(payload.job) : payload
  return { id: codec.string(v, 'id'), runId: codec.string(v, 'runId'), projectId: codec.string(v, 'projectId'), writingJobId: codec.string(v, 'writingJobId'), chapterId: codec.nullableString(v, 'chapterId'), sceneId: codec.nullableString(v, 'sceneId'), status: codec.enum(v, 'status', JOB_STATUSES), orderIndex: codec.integer(v, 'orderIndex'), isolationReason: codec.nullableString(v, 'isolationReason'), isolationReport: v.isolationReport ?? null, createdAt: codec.string(v, 'createdAt'), updatedAt: codec.string(v, 'updatedAt') }
}

function readException(payload: JsonObject): AutonomousExceptionSnapshot {
  const v = 'exception' in payload ? codec.object(payload.exception) : payload
  return { id: codec.string(v, 'id'), runId: codec.string(v, 'runId'), projectId: codec.string(v, 'projectId'), chapterId: codec.nullableString(v, 'chapterId'), changeSetId: codec.nullableString(v, 'changeSetId'), writingJobId: codec.nullableString(v, 'writingJobId'), stepId: codec.nullableString(v, 'stepId'), exceptionType: codec.enum(v, 'exceptionType', EXCEPTION_TYPES), severity: codec.enum(v, 'severity', SEVERITIES), title: codec.string(v, 'title'), description: codec.nullableString(v, 'description'), status: codec.enum(v, 'status', EXCEPTION_STATUSES), autoResolutionStrategy: codec.nullableEnum(v, 'autoResolutionStrategy', RESOLUTION_STRATEGIES), resolution: codec.nullableString(v, 'resolution'), resolutionReport: v.resolutionReport ?? null, createdAt: codec.string(v, 'createdAt'), updatedAt: codec.string(v, 'updatedAt') }
}

function decision<TResult extends JsonObject>(expectedVersion: number, command: CommandEnvelope, eventType: string, payload: JsonObject, result: TResult, occurredAt: string) {
  return { streams: [{ stream: stream(command), expectedVersion, events: [pendingEvent(eventType, payload, command, occurredAt)] }], result }
}

function pendingEvent(eventType: string, payload: JsonObject, command: CommandEnvelope, occurredAt: string): PendingEvent {
  return { eventId: generateId(), eventType, schemaVersion: 1, payload, metadata: { actorType: 'system', projectId: command.projectId }, occurredAt }
}

function stream(command: CommandEnvelope): StreamRef {
  return { aggregateType: AUTONOMOUS_RUN_AGGREGATE_TYPE, aggregateId: command.aggregateId, projectId: command.projectId }
}
