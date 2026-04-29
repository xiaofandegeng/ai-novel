import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterVersions } from '../db/schema'
import { fail, generateId } from '../utils'

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
) {
  if (!content) {
    return fail('Content is required for snapshot')
  }

  const id = generateId()
  const [row] = await db
    .insert(chapterVersions)
    .values({
      id,
      projectId,
      chapterId,
      content,
      wordCount: content.length,
      note: note || 'Manual snapshot',
    })
    .returning()

  return row
}

export async function deleteVersion(projectId: string, versionId: string) {
  const [row] = await db
    .delete(chapterVersions)
    .where(and(eq(chapterVersions.id, versionId), eq(chapterVersions.projectId, projectId)))
    .returning()

  if (!row) {
    return fail('Version not found')
  }

  return row
}
