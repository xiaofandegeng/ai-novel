import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { chapterChangeSetItems, chapters } from '../../db/schema'
import { resetTestDatabase } from '../../test/database'
import { createProject } from '../project/projects.service'
import { dispatchChapterCommand } from '../story/chapter.commands'
import { CREATE_CHAPTER_COMMAND } from '../story/chapter.eventing'
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
})

function dimension() {
  return { status: 'pass' as const, score: 100, reason: '通过' }
}
