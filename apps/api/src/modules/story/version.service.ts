import type { ChapterCommandOptions } from './chapter.commands'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapterVersions } from '../../db/schema'
import { fail } from '../../shared/http/responses'
import { dispatchChapterCommand } from './chapter.commands'
import { APPLY_CHAPTER_CONTENT_COMMAND } from './chapter.eventing'

export async function listChapterVersions(projectId: string, chapterId: string) {
  return db
    .select()
    .from(chapterVersions)
    .where(and(eq(chapterVersions.chapterId, chapterId), eq(chapterVersions.projectId, projectId)))
    .orderBy(desc(chapterVersions.createdAt))
}

export async function createSnapshot(
  projectId: string,
  chapterId: string,
  content: string,
  note?: string,
  options: ChapterCommandOptions = {},
) {
  if (!content) {
    return fail('Content is required for snapshot')
  }

  const result = await dispatchChapterCommand<{ versionId: string }>(
    APPLY_CHAPTER_CONTENT_COMMAND,
    projectId,
    chapterId,
    { content, note: note || 'Manual snapshot' },
    options,
  )
  const [row] = await db.select().from(chapterVersions).where(and(
    eq(chapterVersions.projectId, projectId),
    eq(chapterVersions.chapterId, chapterId),
    eq(chapterVersions.id, result.versionId),
  )).limit(1)
  return row ?? fail('Version projection not found')
}

export async function deleteVersion(projectId: string, versionId: string) {
  const [row] = await db
    .select()
    .from(chapterVersions)
    .where(and(eq(chapterVersions.id, versionId), eq(chapterVersions.projectId, projectId)))

  if (!row) {
    return fail('Version not found')
  }

  return fail('Version history is immutable')
}
