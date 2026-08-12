import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { autonomousRunExceptions, autonomousRunJobs, autonomousWritingRuns, chapters, domainEvents, writingJobs } from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND } from '../project/project.eventing'
import {
  abandonAutonomousRun,
  changeAutonomousRun,
  changeAutonomousRunJob,
  createAutonomousRun,
  handleAutonomousJobCompletion,
  pauseAutonomousRun,
  recordAutonomousException,
} from './autonomous-writing.service'

afterAll(() => sql.end())

describe('autonomous writing service', () => {
  beforeEach(resetTestDatabase)

  it('creates missing placeholder chapters and jobs atomically for a new project', async () => {
    const projectId = 'empty-project'
    await createProject(projectId, '空白长篇')

    const run = await createAutonomousRun(projectId, {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 3,
      targetWordsPerChapter: 2500,
    })

    const createdChapters = await db.select().from(chapters).where(eq(chapters.projectId, projectId)).orderBy(chapters.chapterNumber)
    expect(createdChapters.map(chapter => ({
      title: chapter.title,
      chapterNumber: chapter.chapterNumber,
      status: chapter.status,
    }))).toEqual([
      { title: '第 1 章', chapterNumber: 1, status: 'not_started' },
      { title: '第 2 章', chapterNumber: 2, status: 'not_started' },
      { title: '第 3 章', chapterNumber: 3, status: 'not_started' },
    ])
    await expect(db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, run.id))).resolves.toHaveLength(1)
    await expect(db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id))).resolves.toHaveLength(3)
    await expect(db.select().from(writingJobs).where(eq(writingJobs.autonomousRunId, run.id))).resolves.toHaveLength(3)

    const chapterEvents = await db.select().from(domainEvents).where(and(
      eq(domainEvents.projectId, projectId),
      eq(domainEvents.aggregateType, 'Chapter'),
    ))
    expect(chapterEvents).toHaveLength(3)
  })

  it('rolls back the run when the requested placeholder count is invalid', async () => {
    const projectId = 'invalid-project'
    await createProject(projectId, '无效项目')

    await expect(createAutonomousRun(projectId, {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 0,
      targetWordsPerChapter: 2500,
    })).rejects.toThrow('目标章节数必须是 1 到 20 之间的整数')

    await expect(db.select().from(chapters).where(eq(chapters.projectId, projectId))).resolves.toHaveLength(0)
    await expect(db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.projectId, projectId))).resolves.toHaveLength(0)
  })

  it('revokes late completion updates after a run is paused', async () => {
    const projectId = 'paused-project'
    await createProject(projectId, '暂停项目')
    const run = await createAutonomousRun(projectId, {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 1,
    })
    const [runJob] = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id))
    await changeAutonomousRun(projectId, run.id, { status: 'running' }, 'start-paused-run')
    await changeAutonomousRunJob(projectId, run.id, runJob.id, { status: 'running' }, 'start-paused-run-job')

    await pauseAutonomousRun(projectId, run.id, '用户暂停')
    await handleAutonomousJobCompletion(projectId, runJob.writingJobId, 'completed')

    await expect(db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, run.id))).resolves.toMatchObject([
      { status: 'paused', completedChapterCount: 0 },
    ])
    await expect(db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.id, runJob.id))).resolves.toMatchObject([
      { status: 'running' },
    ])
    const pauseEvents = await db.select({ payload: domainEvents.payload }).from(domainEvents).where(and(
      eq(domainEvents.aggregateId, run.id),
      eq(domainEvents.eventType, 'AutonomousRunChanged'),
    )).orderBy(domainEvents.globalPosition)
    expect(pauseEvents.slice(-2).map(row => (row.payload as { run: { status: string } }).run.status)).toEqual(['pausing', 'paused'])
  })

  it('abandons the run, unfinished jobs, and open exceptions atomically', async () => {
    const projectId = 'abandoned-project'
    await createProject(projectId, '终止项目')
    const run = await createAutonomousRun(projectId, {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 1,
    })
    await changeAutonomousRun(projectId, run.id, { status: 'running' }, 'start-abandoned-run')
    await recordAutonomousException(projectId, run.id, {
      exceptionType: 'operator_override_required',
      severity: 'high',
      title: '等待作者',
    }, 'open-abandoned-exception')

    await abandonAutonomousRun(projectId, run.id)

    await expect(db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, run.id))).resolves.toMatchObject([{ status: 'abandoned' }])
    await expect(db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id))).resolves.toMatchObject([{ status: 'skipped' }])
    await expect(db.select().from(autonomousRunExceptions).where(eq(autonomousRunExceptions.runId, run.id))).resolves.toMatchObject([{ status: 'ignored' }])

    const correlationIds = await db.select({ correlationId: domainEvents.correlationId }).from(domainEvents).where(eq(domainEvents.aggregateId, run.id)).orderBy(domainEvents.globalPosition)
    expect(correlationIds.slice(-4).map(row => row.correlationId)).toEqual([run.id, run.id, run.id, run.id])
    const abandonEvents = await db.select({ payload: domainEvents.payload }).from(domainEvents).where(and(
      eq(domainEvents.aggregateId, run.id),
      eq(domainEvents.eventType, 'AutonomousRunChanged'),
    )).orderBy(domainEvents.globalPosition)
    expect(abandonEvents.slice(-2).map(row => (row.payload as { run: { status: string } }).run.status)).toEqual(['abandoning', 'abandoned'])
  })
})

function createProject(projectId: string, title: string) {
  return commandBus.dispatch({
    commandId: `create:${projectId}`,
    commandType: CREATE_PROJECT_COMMAND,
    aggregateType: 'Project',
    aggregateId: projectId,
    projectId,
    correlationId: `create:${projectId}`,
    payload: { title },
  })
}
