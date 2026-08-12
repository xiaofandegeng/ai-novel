import type { CreateCharacterInput, UpdateCharacterInput } from '@ai-novel/shared'
import type { CharacterCommandOptions } from './character.commands'
import type { CharacterSnapshot } from './character.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { characters } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { compactCharacterPayload, dispatchCharacterCommand } from './character.commands'
import {
  CHANGE_CHARACTER_COMMAND,
  CREATE_CHARACTER_COMMAND,
  DELETE_CHARACTER_COMMAND,
} from './character.eventing'

export function listCharacters(projectId: string) {
  return db.select().from(characters).where(eq(characters.projectId, projectId))
}

export async function getCharacter(projectId: string, id: string) {
  const [row] = await db.select().from(characters).where(and(
    eq(characters.id, id),
    eq(characters.projectId, projectId),
  ))
  return row ?? null
}

export async function createCharacter(
  projectId: string,
  input: CreateCharacterInput,
  options: CharacterCommandOptions = {},
) {
  const id = generateId()
  const result = await dispatchCharacterCommand<CharacterSnapshot>(
    CREATE_CHARACTER_COMMAND,
    projectId,
    id,
    compactCharacterPayload(input),
    options,
  )
  return await getCharacter(projectId, result.id) ?? result
}

export async function updateCharacter(
  projectId: string,
  id: string,
  input: UpdateCharacterInput,
  options: CharacterCommandOptions = {},
) {
  try {
    const result = await dispatchCharacterCommand<CharacterSnapshot>(
      CHANGE_CHARACTER_COMMAND,
      projectId,
      id,
      compactCharacterPayload(input),
      options,
    )
    return await getCharacter(projectId, result.id) ?? result
  }
  catch (error: unknown) {
    if (isCharacterMissing(error))
      return null
    throw error
  }
}

export async function deleteCharacter(
  projectId: string,
  id: string,
  options: CharacterCommandOptions = {},
) {
  try {
    return await dispatchCharacterCommand<CharacterSnapshot>(
      DELETE_CHARACTER_COMMAND,
      projectId,
      id,
      {},
      options,
    )
  }
  catch (error: unknown) {
    if (isCharacterMissing(error))
      return null
    throw error
  }
}

function isCharacterMissing(error: unknown): boolean {
  return error instanceof DomainCommandError
    && (error.code === 'CHARACTER_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
}
