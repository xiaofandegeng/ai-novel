import type { CreateConflictTimelineEventInput } from '@ai-novel/shared'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { conflictTimelineEvents } from '../db/schema'
import { generateId } from '../utils'
import { assertConflictBelongsToProject, assertOptionalChapterBelongsToProject, assertOptionalSceneBelongsToProject } from './ownership.service'

export class ConflictTimelineService {
  static async getConflictTimeline(projectId: string, conflictId: string) {
    return db.select().from(conflictTimelineEvents).where(
      and(
        eq(conflictTimelineEvents.projectId, projectId),
        eq(conflictTimelineEvents.conflictId, conflictId),
      ),
    ).orderBy(asc(conflictTimelineEvents.createdAt))
  }

  static async getProjectTimeline(projectId: string) {
    return db.select().from(conflictTimelineEvents).where(
      eq(conflictTimelineEvents.projectId, projectId),
    ).orderBy(asc(conflictTimelineEvents.createdAt))
  }

  static async createEvent(projectId: string, data: CreateConflictTimelineEventInput) {
    await assertConflictBelongsToProject(projectId, data.conflictId)
    await assertOptionalChapterBelongsToProject(projectId, data.chapterId)
    await assertOptionalSceneBelongsToProject(projectId, data.sceneId)

    const values = {
      id: generateId(),
      projectId,
      conflictId: data.conflictId,
      chapterId: data.chapterId || null,
      sceneId: data.sceneId || null,
      intensityBefore: data.intensityBefore ?? 0,
      intensityAfter: data.intensityAfter ?? 0,
      statusBefore: data.statusBefore ?? '',
      statusAfter: data.statusAfter ?? '',
      reason: data.reason || null,
      evidence: data.evidence || null,
      sourceType: (data.sourceType ?? 'manual') as 'ai_extracted' | 'manual',
    } satisfies typeof conflictTimelineEvents.$inferInsert
    const [row] = await db.insert(conflictTimelineEvents).values(values).returning()
    return row
  }

  static async deleteEvent(projectId: string, id: string) {
    const [row] = await db.delete(conflictTimelineEvents).where(
      and(
        eq(conflictTimelineEvents.id, id),
        eq(conflictTimelineEvents.projectId, projectId),
      ),
    ).returning()
    return row
  }
}
