import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { characterArcEvents } from '../db/schema'
import { generateId, now, updatedFields } from '../utils'
import { assertCharacterBelongsToProject, assertOptionalChapterBelongsToProject, assertOptionalSceneBelongsToProject } from './ownership.service'

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

  static async createEvent(projectId: string, data: {
    characterId: string
    chapterId?: string
    sceneId?: string
    eventType: string
    beforeState?: string
    afterState?: string
    motivationChange?: string
    relationshipImpact?: string
    evidence?: string
    sourceType?: string
  }) {
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
      eventType: data.eventType as any,
      beforeState: data.beforeState || null,
      afterState: data.afterState || null,
      motivationChange: data.motivationChange || null,
      relationshipImpact: data.relationshipImpact || null,
      evidence: data.evidence || null,
      sourceType: (data.sourceType as any) || 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    return row
  }

  static async updateEvent(projectId: string, id: string, data: {
    eventType?: string
    chapterId?: string | null
    sceneId?: string | null
    beforeState?: string | null
    afterState?: string | null
    motivationChange?: string | null
    relationshipImpact?: string | null
    evidence?: string | null
  }) {
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
