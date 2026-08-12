import type { CommandEnvelope, JsonObject } from '../../eventing'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { autonomousRunExceptions, autonomousRunJobs, autonomousWritingRuns, eventOutbox } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  ADD_AUTONOMOUS_RUN_JOB_COMMAND,
  AUTONOMOUS_RUN_AGGREGATE_TYPE,
  AUTONOMOUS_RUN_PROJECTION,
  CHANGE_AUTONOMOUS_EXCEPTION_COMMAND,
  CHANGE_AUTONOMOUS_RUN_COMMAND,
  CHANGE_AUTONOMOUS_RUN_JOB_COMMAND,
  OPEN_AUTONOMOUS_EXCEPTION_COMMAND,
  PREPARE_AUTONOMOUS_RUN_COMMAND,
  registerAutonomousRunEventing,
  REQUEST_AUTONOMOUS_RUN_EXECUTION_COMMAND,
} from './autonomous-run.eventing'

afterAll(() => sql.end())

describe('autonomous run eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('prepares a run and transitions its chapter queue', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(PREPARE_AUTONOMOUS_RUN_COMMAND, {
      strategy: 'balanced',
      scopeType: 'next_n_chapters',
      targetChapterCount: 1,
      targetWordsPerChapter: 3000,
    }))
    await runtime.commands.dispatch(command(ADD_AUTONOMOUS_RUN_JOB_COMMAND, {
      id: 'run-job-1',
      writingJobId: 'job-1',
      chapterId: 'chapter-1',
      orderIndex: 0,
    }, 'add-job'))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, {
      status: 'running',
      startedAt: '2026-08-12T00:00:00.000Z',
    }, 'start-run'))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_JOB_COMMAND, {
      id: 'run-job-1',
      status: 'completed',
    }, 'complete-job'))

    await expect(db.select().from(autonomousWritingRuns)).resolves.toMatchObject([{ id: 'run-1', status: 'running' }])
    await expect(db.select().from(autonomousRunJobs)).resolves.toMatchObject([{ id: 'run-job-1', status: 'completed' }])
  })

  it('persists a durable execution request in the same command transaction', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(PREPARE_AUTONOMOUS_RUN_COMMAND, {
      strategy: 'balanced',
      scopeType: 'next_n_chapters',
      targetChapterCount: 1,
      targetWordsPerChapter: 3000,
    }))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'running' }, 'start-for-outbox'))

    await runtime.commands.dispatch(command(REQUEST_AUTONOMOUS_RUN_EXECUTION_COMMAND, {}, 'request-execution'))

    await expect(db.select().from(eventOutbox)).resolves.toMatchObject([{
      status: 'pending',
      handlerName: 'autonomous-run.execute',
      payload: { projectId: 'project-1', runId: 'run-1' },
    }])
  })

  it('enforces run lifecycle transitions and accepts the realized target count', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(PREPARE_AUTONOMOUS_RUN_COMMAND, {
      strategy: 'balanced',
      scopeType: 'project',
      targetWordsPerChapter: 3000,
    }))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, {
      targetChapterCount: 1,
      status: 'running',
    }, 'start-with-target'))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, {
      status: 'completed',
    }, 'complete-run'))

    await expect(runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, {
      status: 'running',
    }, 'restart-completed'))).rejects.toMatchObject({ code: 'INVALID_AUTONOMOUS_RUN_TRANSITION' })
    await expect(db.select().from(autonomousWritingRuns)).resolves.toMatchObject([{ targetChapterCount: 1, status: 'completed' }])
  })

  it('requires pausing and abandoning states and keeps failed runs terminal', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(PREPARE_AUTONOMOUS_RUN_COMMAND, {
      strategy: 'safe',
      scopeType: 'project',
      targetWordsPerChapter: 2500,
    }))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'running' }, 'start'))

    await expect(runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'paused' }, 'skip-pausing')))
      .rejects
      .toMatchObject({ code: 'INVALID_AUTONOMOUS_RUN_TRANSITION' })
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'pausing' }, 'request-pause'))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'paused' }, 'finish-pause'))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'running' }, 'resume'))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'failed' }, 'fail'))

    await expect(runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_RUN_COMMAND, { status: 'running' }, 'restart-failed')))
      .rejects
      .toMatchObject({ code: 'INVALID_AUTONOMOUS_RUN_TRANSITION' })
  })

  it('owns exception lifecycle and rejects foreign chapters', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(PREPARE_AUTONOMOUS_RUN_COMMAND, {
      strategy: 'safe',
      scopeType: 'project',
      targetWordsPerChapter: 2500,
    }))
    await expect(runtime.commands.dispatch(command(OPEN_AUTONOMOUS_EXCEPTION_COMMAND, {
      id: 'exception-1',
      chapterId: 'missing',
      exceptionType: 'ai_failed',
      severity: 'high',
      title: '生成失败',
    }, 'bad-exception'))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })
    await runtime.commands.dispatch(command(OPEN_AUTONOMOUS_EXCEPTION_COMMAND, {
      id: 'exception-1',
      chapterId: 'chapter-1',
      exceptionType: 'ai_failed',
      severity: 'high',
      title: '生成失败',
    }, 'open-exception'))
    await runtime.commands.dispatch(command(CHANGE_AUTONOMOUS_EXCEPTION_COMMAND, {
      id: 'exception-1',
      status: 'resolved',
      resolution: '重试成功',
    }, 'resolve-exception'))
    await expect(db.select().from(autonomousRunExceptions)).resolves.toMatchObject([{ id: 'exception-1', status: 'resolved' }])
  })

  it('replays the complete run projection', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(PREPARE_AUTONOMOUS_RUN_COMMAND, {
      strategy: 'fast',
      scopeType: 'continue_incomplete',
      targetWordsPerChapter: 2000,
    }))
    await runtime.commands.dispatch(command(ADD_AUTONOMOUS_RUN_JOB_COMMAND, {
      id: 'run-job-1',
      writingJobId: 'job-1',
      chapterId: 'chapter-1',
      orderIndex: 0,
    }, 'add-job'))
    await runtime.commands.dispatch(command(OPEN_AUTONOMOUS_EXCEPTION_COMMAND, {
      id: 'exception-1',
      exceptionType: 'health_regression',
      severity: 'medium',
      title: '健康下降',
    }, 'open-exception'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(AUTONOMOUS_RUN_PROJECTION, { projectId: 'project-1' })
    await expect(db.select().from(autonomousWritingRuns)).resolves.toHaveLength(1)
    await expect(db.select().from(autonomousRunJobs)).resolves.toHaveLength(1)
    await expect(db.select().from(autonomousRunExceptions)).resolves.toHaveLength(1)
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry(events)
  const commands = new CommandBus(store, projections, events)
  const aggregates = new AggregateRepository(store, events)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerChapterEventing({ aggregates, commands, events, projections })
  registerAutonomousRunEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
}

function command(commandType: string, payload: JsonObject, commandId = 'run-command'): CommandEnvelope {
  return { commandId, commandType, aggregateType: AUTONOMOUS_RUN_AGGREGATE_TYPE, aggregateId: 'run-1', projectId: 'project-1', correlationId: commandId, payload }
}
