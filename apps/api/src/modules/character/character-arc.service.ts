import type { CreateCharacterArcEventInput, UpdateCharacterArcEventInput } from '@ai-novel/shared'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { characterArcEvents } from '../../db/schema'
import { assertCharacterBelongsToProject, assertOptionalChapterBelongsToProject, assertOptionalSceneBelongsToProject } from '../../shared/ownership'
import { generateId, now, updatedFields } from '../../shared/utils'

export class CharacterArcService {
  static async getCharacterTimeline(projectId: string, characterId: string) {
    return db.select().from(characterArcEvents).where(
      and(
        eq(characterArcEvents.projectId, projectId),
        eq(characterArcEvents.characterId, characterId),
      ),
    ).orderBy(asc(characterArcEvents.createdAt))
  }

  static async getProjectTimeline(projectId: string) {
    return db.select().from(characterArcEvents).where(
      eq(characterArcEvents.projectId, projectId),
    ).orderBy(asc(characterArcEvents.createdAt))
  }

  static async createEvent(projectId: string, data: CreateCharacterArcEventInput) {
    await assertCharacterBelongsToProject(projectId, data.characterId)
    await assertOptionalChapterBelongsToProject(projectId, data.chapterId)
    await assertOptionalSceneBelongsToProject(projectId, data.sceneId)

    const id = generateId()
    const timestamp = now()
    const [row] = await db.insert(characterArcEvents).values({
      id,
      projectId,
      characterId: data.characterId,
      chapterId: data.chapterId || null,
      sceneId: data.sceneId || null,
      eventType: data.eventType,
      beforeState: data.beforeState || null,
      afterState: data.afterState || null,
      motivationChange: data.motivationChange || null,
      relationshipImpact: data.relationshipImpact || null,
      evidence: data.evidence || null,
      sourceType: data.sourceType || 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    return row
  }

  static async updateEvent(projectId: string, id: string, data: UpdateCharacterArcEventInput) {
    await assertOptionalChapterBelongsToProject(projectId, data.chapterId)
    await assertOptionalSceneBelongsToProject(projectId, data.sceneId)

    const fields = updatedFields({
      eventType: data.eventType,
      chapterId: data.chapterId,
      sceneId: data.sceneId,
      beforeState: data.beforeState,
      afterState: data.afterState,
      motivationChange: data.motivationChange,
      relationshipImpact: data.relationshipImpact,
      evidence: data.evidence,
    })
    const [row] = await db.update(characterArcEvents).set(fields).where(
      and(
        eq(characterArcEvents.id, id),
        eq(characterArcEvents.projectId, projectId),
      ),
    ).returning()
    return row
  }

  static async deleteEvent(projectId: string, id: string) {
    const [row] = await db.delete(characterArcEvents).where(
      and(
        eq(characterArcEvents.id, id),
        eq(characterArcEvents.projectId, projectId),
      ),
    ).returning()
    return row
  }
}
