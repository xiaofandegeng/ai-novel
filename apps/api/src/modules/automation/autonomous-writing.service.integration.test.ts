import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { autonomousRunJobs, autonomousWritingRuns, chapters, domainEvents, writingJobs } from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND } from '../project/project.eventing'
import { createAutonomousRun } from './autonomous-writing.service'

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
