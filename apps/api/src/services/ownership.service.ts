import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, characters, volumes } from '../db/schema'

export async function assertVolumeBelongsToProject(projectId: string, volumeId: string) {
  const [row] = await db.select({ id: volumes.id }).from(volumes).where(
    and(eq(volumes.id, volumeId), eq(volumes.projectId, projectId)),
  )
  if (!row)
    throw new Error('卷不属于当前项目')
}

export async function assertChapterBelongsToProject(projectId: string, chapterId: string) {
  const [row] = await db.select({ id: chapters.id }).from(chapters).where(
    and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)),
  )
  if (!row)
    throw new Error('章节不属于当前项目')
}

export async function assertCharactersBelongToProject(projectId: string, ids: string[]) {
  const results = []
  for (const id of ids) {
    const [row] = await db.select().from(characters).where(
      and(eq(characters.id, id), eq(characters.projectId, projectId)),
    )
    if (!row)
      throw new Error(`角色 ${id} 不属于当前项目`)
    results.push(row)
  }
  return results
}

export async function assertOptionalChapterBelongsToProject(projectId: string, chapterId?: string | null) {
  if (!chapterId)
    return
  await assertChapterBelongsToProject(projectId, chapterId)
}

export async function assertOptionalVolumeBelongsToProject(projectId: string, volumeId?: string | null) {
  if (!volumeId)
    return
  await assertVolumeBelongsToProject(projectId, volumeId)
}
