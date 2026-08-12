import type { CreateConflictTimelineEventInput } from '@ai-novel/shared'
import type { ConflictCommandOptions } from './conflict.commands'
import type { ConflictTimelineSnapshot } from './conflict.eventing'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { conflictTimelineEvents } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { compactConflictPayload, dispatchConflictCommand } from './conflict.commands'
import {
  RECORD_CONFLICT_TIMELINE_COMMAND,
  REMOVE_CONFLICT_TIMELINE_COMMAND,
} from './conflict.eventing'

export class ConflictTimelineService {
  static getConflictTimeline(projectId: string, conflictId: string) {
    return db.select().from(conflictTimelineEvents).where(and(
      eq(conflictTimelineEvents.projectId, projectId),
      eq(conflictTimelineEvents.conflictId, conflictId),
    )).orderBy(asc(conflictTimelineEvents.createdAt))
  }

  static getProjectTimeline(projectId: string) {
    return db.select().from(conflictTimelineEvents).where(
      eq(conflictTimelineEvents.projectId, projectId),
    ).orderBy(asc(conflictTimelineEvents.createdAt))
  }

  static async createEvent(
    projectId: string,
    data: CreateConflictTimelineEventInput,
    options: ConflictCommandOptions = {},
  ) {
    return dispatchConflictCommand<ConflictTimelineSnapshot>(
      RECORD_CONFLICT_TIMELINE_COMMAND,
      projectId,
      data.conflictId,
      compactConflictPayload({ ...data, id: generateId() }),
      options,
    )
  }

  static async deleteEvent(
    projectId: string,
    id: string,
    options: ConflictCommandOptions = {},
  ) {
    const [current] = await db.select({ conflictId: conflictTimelineEvents.conflictId })
      .from(conflictTimelineEvents)
      .where(and(
        eq(conflictTimelineEvents.id, id),
        eq(conflictTimelineEvents.projectId, projectId),
      ))
      .limit(1)
    if (!current)
      return null
    try {
      return await dispatchConflictCommand<ConflictTimelineSnapshot>(
        REMOVE_CONFLICT_TIMELINE_COMMAND,
        projectId,
        current.conflictId,
        { id },
        options,
      )
    }
    catch (error: unknown) {
      if (error instanceof DomainCommandError && error.code === 'CONFLICT_TIMELINE_NOT_FOUND')
        return null
      throw error
    }
  }
}
