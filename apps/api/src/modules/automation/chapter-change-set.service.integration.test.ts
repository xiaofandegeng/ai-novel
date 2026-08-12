import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { autonomousRunJobs, chapterChangeSetItems, chapterChangeSets, chapters, writingJobs } from '../../db/schema'
import { resetTestDatabase } from '../../test/database'
import { createProject } from '../project/projects.service'
import { dispatchChapterCommand } from '../story/chapter.commands'
import { CREATE_CHAPTER_COMMAND } from '../story/chapter.eventing'
import { changeAutonomousRun, createAutonomousRun, pauseAutonomousRun } from './autonomous-writing.service'
import {
  applyChangeSet,
  approveChangeSet,
  createChapterChangeSet,
  rejectChangeSetItem,
} from './chapter-change-set.service'

afterAll(() => sql.end())

describe('chapter change set service', () => {
  beforeEach(resetTestDatabase)

  it('never overwrites chapter content when the draft item was rejected', async () => {
    const project = await createProject({ title: '项目', status: 'planning' }, { commandId: 'project' })
    await dispatchChapterCommand(CREATE_CHAPTER_COMMAND, project.id, 'chapter-1', {
      chapterNumber: 1,
      title: '旧章',
      draft: '作者原文',
    }, { commandId: 'chapter' })
    const changeSet = await createChapterChangeSet({
      projectId: project.id,
      chapterId: 'chapter-1',
      draftContent: 'AI 新正文',
      consistencyReport: {
        overallStatus: 'pass',
        score: 100,
        themeAlignment: dimension(),
        plotContinuity: dimension(),
        characterConsistency: dimension(),
        worldRuleConsistency: dimension(),
        foreshadowingConsistency: dimension(),
        styleConsistency: dimension(),
        risks: [],
        suggestedFixes: [],
      },
      extractedChanges: { summary: '摘要' },
    })
    const [draftItem] = await db.select().from(chapterChangeSetItems).where(and(eq(chapterChangeSetItems.changeSetId, changeSet.id), eq(chapterChangeSetItems.itemType, 'draft')))

    await rejectChangeSetItem(project.id, changeSet.id, draftItem.id)
    await approveChangeSet(project.id, changeSet.id)
    await applyChangeSet(project.id, changeSet.id)

    await expect(db.select({ draft: chapters.draft }).from(chapters)).resolves.toEqual([{ draft: '作者原文' }])
  })

  it('rejects an approved draft when its autonomous run authorization was paused', async () => {
    const project = await createProject({ title: '暂停项目', status: 'planning' }, { commandId: 'paused-project' })
    await dispatchChapterCommand(CREATE_CHAPTER_COMMAND, project.id, 'paused-chapter', {
      chapterNumber: 1,
      title: '暂停章',
      draft: '作者原文',
    }, { commandId: 'paused-chapter' })
    const run = await createAutonomousRun(project.id, {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 1,
    })
    const [runJob] = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id))
    const [job] = await db.select().from(writingJobs).where(eq(writingJobs.id, runJob.writingJobId))
    await changeAutonomousRun(project.id, run.id, { status: 'running' }, 'start-paused-change-set')

    const changeSet = await createChapterChangeSet({
      projectId: project.id,
      chapterId: 'paused-chapter',
      writingJobId: job.id,
      draftContent: '迟到的 AI 正文',
      consistencyReport: {
        overallStatus: 'pass',
        score: 100,
        themeAlignment: dimension(),
        plotContinuity: dimension(),
        characterConsistency: dimension(),
        worldRuleConsistency: dimension(),
        foreshadowingConsistency: dimension(),
        styleConsistency: dimension(),
        risks: [],
        suggestedFixes: [],
      },
      extractedChanges: {},
    })
    await approveChangeSet(project.id, changeSet.id)
    await pauseAutonomousRun(project.id, run.id)

    await expect(applyChangeSet(project.id, changeSet.id)).rejects.toMatchObject({
      code: 'AUTONOMOUS_RUN_AUTHORIZATION_REVOKED',
    })
    await expect(db.select({ draft: chapters.draft }).from(chapters).where(eq(chapters.id, 'paused-chapter'))).resolves.toEqual([{ draft: '作者原文' }])
    await expect(db.select({ status: chapterChangeSets.status }).from(chapterChangeSets).where(eq(chapterChangeSets.id, changeSet.id))).resolves.toEqual([{ status: 'approved' }])
  })
})

function dimension() {
  return { status: 'pass' as const, score: 100, reason: '通过' }
}
