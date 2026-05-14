import type { AuthoringEventSource, AuthoringEventType } from '@ai-novel/shared'
import { db } from '../db'
import { authoringEvents } from '../db/schema'
import { generateId } from '../utils'

export class AuthoringEventService {
  static async logEvent(params: {
    projectId: string
    eventType: AuthoringEventType
    source: AuthoringEventSource
    chapterId?: string | null
    sceneId?: string | null
    payload?: any
  }) {
    const id = generateId()
    await db.insert(authoringEvents).values({
      id,
      projectId: params.projectId,
      eventType: params.eventType,
      source: params.source,
      chapterId: params.chapterId || null,
      sceneId: params.sceneId || null,
      payload: params.payload || null,
    })
    return id
  }

  static async getProjectEvents(projectId: string, limit = 100) {
    return await db.query.authoringEvents.findMany({
      where: (fields, { eq }) => eq(fields.projectId, projectId),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      limit,
    })
  }
}
