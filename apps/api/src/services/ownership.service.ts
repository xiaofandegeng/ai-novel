import { and, eq, inArray } from 'drizzle-orm'
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
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  if (uniqueIds.length === 0)
    return []

  const results = await db.select().from(characters).where(
    and(
      eq(characters.projectId, projectId),
      inArray(characters.id, uniqueIds),
    ),
  )

  if (results.length !== uniqueIds.length) {
    const foundIds = results.map(r => r.id)
    const missing = uniqueIds.find(id => !foundIds.includes(id))
    throw new Error(`角色 ${missing} 不属于当前项目或不存在`)
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
