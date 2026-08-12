import type { AuthoringEventSource, AuthoringEventType } from '@ai-novel/shared'
import type { NarrativeKnowledgeCommandOptions } from './narrative-knowledge.commands'
import type { AuthoringActivitySnapshot } from './narrative-knowledge.eventing'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { authoringEvents } from '../../db/schema'
import { generateId } from '../../shared/utils'
import { compactNarrativeKnowledgePayload, dispatchNarrativeKnowledgeCommand } from './narrative-knowledge.commands'
import { RECORD_AUTHORING_EVENT_COMMAND } from './narrative-knowledge.eventing'

export class AuthoringEventService {
  static async logEvent(params: {
    projectId: string
    eventType: AuthoringEventType
    source: AuthoringEventSource
    chapterId?: string | null
    sceneId?: string | null
    payload?: unknown
  }, options: NarrativeKnowledgeCommandOptions = {}) {
    const id = generateId()
    const result = await dispatchNarrativeKnowledgeCommand<AuthoringActivitySnapshot>(
      RECORD_AUTHORING_EVENT_COMMAND,
      params.projectId,
      compactNarrativeKnowledgePayload({
        id,
        eventType: params.eventType,
        source: params.source,
        chapterId: params.chapterId ?? null,
        sceneId: params.sceneId ?? null,
        payload: params.payload ?? null,
      }),
      options,
    )
    return result.id
  }

  static async getProjectEvents(projectId: string, limit = 100) {
    return await db.select().from(authoringEvents).where(eq(authoringEvents.projectId, projectId)).orderBy(desc(authoringEvents.createdAt)).limit(limit)
  }
}
