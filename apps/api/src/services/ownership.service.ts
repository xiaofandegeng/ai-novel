import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { chapters, chapterScenes, characters, conflicts, foreshadowingItems, volumes } from '../db/schema'

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

export async function assertSceneBelongsToProject(projectId: string, sceneId: string) {
  const [row] = await db.select({ id: chapterScenes.id }).from(chapterScenes).where(
    and(eq(chapterScenes.id, sceneId), eq(chapterScenes.projectId, projectId)),
  )
  if (!row)
    throw new Error('场景不属于当前项目')
}

export async function assertCharacterBelongsToProject(projectId: string, characterId: string) {
  const [row] = await db.select({ id: characters.id }).from(characters).where(
    and(eq(characters.id, characterId), eq(characters.projectId, projectId)),
  )
  if (!row)
    throw new Error('角色不属于当前项目')
}

export async function assertConflictBelongsToProject(projectId: string, conflictId: string) {
  const [row] = await db.select({ id: conflicts.id }).from(conflicts).where(
    and(eq(conflicts.id, conflictId), eq(conflicts.projectId, projectId)),
  )
  if (!row)
    throw new Error('矛盾不属于当前项目')
}

export async function assertForeshadowingBelongsToProject(projectId: string, foreshadowingId: string) {
  const [row] = await db.select({ id: foreshadowingItems.id }).from(foreshadowingItems).where(
    and(eq(foreshadowingItems.id, foreshadowingId), eq(foreshadowingItems.projectId, projectId)),
  )
  if (!row)
    throw new Error('伏笔不属于当前项目')
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

export async function assertOptionalSceneBelongsToProject(projectId: string, sceneId?: string | null) {
  if (!sceneId)
    return
  await assertSceneBelongsToProject(projectId, sceneId)
}

export async function assertOptionalVolumeBelongsToProject(projectId: string, volumeId?: string | null) {
  if (!volumeId)
    return
  await assertVolumeBelongsToProject(projectId, volumeId)
}
