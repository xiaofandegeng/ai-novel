import type { CommandEnvelope, JsonObject } from '../../eventing'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { eventOutbox, writingJobs, writingJobSteps } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  CHANGE_WRITING_JOB_COMMAND,
  CHANGE_WRITING_JOB_STEP_COMMAND,
  CREATE_WRITING_JOB_COMMAND,
  DELETE_WRITING_JOB_COMMAND,
  registerWritingJobEventing,
  REQUEST_WRITING_JOB_EXECUTION_COMMAND,
  WRITING_JOB_AGGREGATE_TYPE,
  WRITING_JOB_PROJECTION,
} from './writing-job.eventing'

afterAll(() => sql.end())

describe('writing job eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('creates one job with ordered steps and changes their state', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(command(CREATE_WRITING_JOB_COMMAND, {
      mode: 'outline_then_draft',
      currentChapterId: 'chapter-1',
      targetWords: 3000,
      steps: [
        { id: 'step-1', stepType: 'prepare_context' },
        { id: 'step-2', stepType: 'generate_draft' },
      ],
    }))).resolves.toMatchObject({ id: 'job-1', status: 'idle' })
    await expect(runtime.commands.dispatch(command(CHANGE_WRITING_JOB_COMMAND, {
      status: 'running',
    }, 'start-job'))).resolves.toMatchObject({ status: 'running' })
    await expect(runtime.commands.dispatch(command(CHANGE_WRITING_JOB_STEP_COMMAND, {
      id: 'step-1',
      status: 'completed',
      output: 'context',
    }, 'finish-step'))).resolves.toMatchObject({ id: 'step-1', status: 'completed' })

    await expect(db.select().from(writingJobs)).resolves.toMatchObject([{ id: 'job-1', status: 'running' }])
    await expect(db.select().from(writingJobSteps)).resolves.toHaveLength(2)
  })

  it('rejects missing steps and cross-project chapters', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(CREATE_WRITING_JOB_COMMAND, {
      mode: 'draft_only',
      currentChapterId: 'chapter-1',
      steps: [],
    }))
    await expect(runtime.commands.dispatch(command(CHANGE_WRITING_JOB_STEP_COMMAND, {
      id: 'missing',
      status: 'running',
    }, 'missing-step'))).rejects.toMatchObject({ code: 'WRITING_JOB_STEP_NOT_FOUND' })
    await expect(runtime.commands.dispatch({
      ...command(CREATE_WRITING_JOB_COMMAND, {
        mode: 'draft_only',
        currentChapterId: 'chapter-1',
        steps: [],
      }, 'other-project-job'),
      aggregateId: 'job-other',
      projectId: 'project-2',
    })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
  })

  it('persists writing execution as a durable outbox request', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(CREATE_WRITING_JOB_COMMAND, {
      mode: 'draft_only',
      currentChapterId: 'chapter-1',
      steps: [{ id: 'step-1', stepType: 'generate_draft' }],
    }))

    await runtime.commands.dispatch(command(REQUEST_WRITING_JOB_EXECUTION_COMMAND, {}, 'execute-job'))

    await expect(db.select().from(eventOutbox)).resolves.toMatchObject([{
      status: 'pending',
      handlerName: 'writing-job.execute',
      payload: { projectId: 'project-1', jobId: 'job-1' },
    }])
  })

  it('deletes and replays the complete job projection', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(CREATE_WRITING_JOB_COMMAND, {
      mode: 'draft_only',
      currentChapterId: 'chapter-1',
      steps: [{ id: 'step-1', stepType: 'generate_draft' }],
    }))
    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(WRITING_JOB_PROJECTION, { projectId: 'project-1' })
    await expect(db.select().from(writingJobs)).resolves.toHaveLength(1)
    await expect(db.select().from(writingJobSteps)).resolves.toHaveLength(1)

    await runtime.commands.dispatch(command(DELETE_WRITING_JOB_COMMAND, {}, 'delete-job'))
    await expect(db.select().from(writingJobs)).resolves.toHaveLength(0)
    await expect(db.select().from(writingJobSteps)).resolves.toHaveLength(0)
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
  registerWritingJobEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
}

function command(commandType: string, payload: JsonObject, commandId = 'writing-job-command'): CommandEnvelope {
  return { commandId, commandType, aggregateType: WRITING_JOB_AGGREGATE_TYPE, aggregateId: 'job-1', projectId: 'project-1', correlationId: commandId, payload }
}
