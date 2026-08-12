import type { CreateCharacterArcEventInput, UpdateCharacterArcEventInput } from '@ai-novel/shared'
import type { CharacterCommandOptions } from './character.commands'
import type { CharacterArcSnapshot } from './character.eventing'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { characterArcEvents } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { compactCharacterPayload, dispatchCharacterCommand } from './character.commands'
import {
  CORRECT_CHARACTER_ARC_EVENT_COMMAND,
  RECORD_CHARACTER_ARC_EVENT_COMMAND,
  REMOVE_CHARACTER_ARC_EVENT_COMMAND,
} from './character.eventing'

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

  static async createEvent(
    projectId: string,
    data: CreateCharacterArcEventInput,
    options: CharacterCommandOptions = {},
  ) {
    const id = generateId()
    return dispatchCharacterCommand<CharacterArcSnapshot>(
      RECORD_CHARACTER_ARC_EVENT_COMMAND,
      projectId,
      data.characterId,
      compactCharacterPayload({ ...data, id }),
      options,
    )
  }

  static async updateEvent(
    projectId: string,
    id: string,
    data: UpdateCharacterArcEventInput,
    options: CharacterCommandOptions = {},
  ) {
    const [current] = await db.select().from(characterArcEvents).where(
      and(
        eq(characterArcEvents.id, id),
        eq(characterArcEvents.projectId, projectId),
      ),
    ).limit(1)
    if (!current)
      return undefined
    try {
      return await dispatchCharacterCommand<CharacterArcSnapshot>(
        CORRECT_CHARACTER_ARC_EVENT_COMMAND,
        projectId,
        current.characterId,
        compactCharacterPayload({ ...data, id }),
        options,
      )
    }
    catch (error: unknown) {
      if (isArcMissing(error))
        return undefined
      throw error
    }
  }

  static async deleteEvent(
    projectId: string,
    id: string,
    options: CharacterCommandOptions = {},
  ) {
    const [current] = await db.select().from(characterArcEvents).where(
      and(
        eq(characterArcEvents.id, id),
        eq(characterArcEvents.projectId, projectId),
      ),
    ).limit(1)
    if (!current)
      return undefined
    try {
      return await dispatchCharacterCommand<CharacterArcSnapshot>(
        REMOVE_CHARACTER_ARC_EVENT_COMMAND,
        projectId,
        current.characterId,
        { id },
        options,
      )
    }
    catch (error: unknown) {
      if (isArcMissing(error))
        return undefined
      throw error
    }
  }
}

function isArcMissing(error: unknown): boolean {
  return error instanceof DomainCommandError
    && (
      error.code === 'CHARACTER_NOT_FOUND'
      || error.code === 'CHARACTER_ARC_EVENT_NOT_FOUND'
      || error.code === 'PROJECT_NOT_FOUND'
    )
}
