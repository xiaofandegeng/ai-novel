import type { CreateForeshadowingInput, UpdateForeshadowingInput } from '@ai-novel/shared'
import type { ForeshadowingCommandOptions } from './foreshadowing.commands'
import type { ForeshadowingSnapshot } from './foreshadowing.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { foreshadowingCharacters, foreshadowingItems } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { matchCharacterIdsFromText } from '../character/character-utils.service'
import { compactForeshadowingPayload, dispatchForeshadowingCommand } from './foreshadowing.commands'
import {
  CHANGE_FORESHADOWING_COMMAND,
  CREATE_FORESHADOWING_COMMAND,
  DELETE_FORESHADOWING_COMMAND,
  REPLACE_FORESHADOWING_CHARACTERS_COMMAND,
} from './foreshadowing.eventing'

export interface ForeshadowingCharacterInput {
  characterId: string
  relationType: 'protagonist' | 'antagonist' | 'victim' | 'witness' | 'related'
}

export function listForeshadowing(projectId: string) {
  return db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
}

export async function createForeshadowing(
  projectId: string,
  input: CreateForeshadowingInput,
  options: ForeshadowingCommandOptions = {},
) {
  const characterIds = input.characterIds?.length
    ? input.characterIds
    : await matchCharacterIdsFromText(projectId, input.relatedCharacters ?? null)
  const id = generateId()
  const result = await dispatchForeshadowingCommand<ForeshadowingSnapshot>(
    CREATE_FORESHADOWING_COMMAND,
    projectId,
    id,
    compactForeshadowingPayload({ ...input, characterIds: characterIds ?? undefined }),
    options,
  )
  return await getForeshadowing(projectId, result.id) ?? result
}

export async function updateForeshadowing(
  projectId: string,
  id: string,
  input: UpdateForeshadowingInput,
  options: ForeshadowingCommandOptions = {},
) {
  const characterIds = input.relatedCharacters !== undefined && !input.characterIds?.length
    ? await matchCharacterIdsFromText(projectId, input.relatedCharacters)
    : input.characterIds
  try {
    const result = await dispatchForeshadowingCommand<ForeshadowingSnapshot>(
      CHANGE_FORESHADOWING_COMMAND,
      projectId,
      id,
      compactForeshadowingPayload({ ...input, characterIds: characterIds ?? undefined }),
      options,
    )
    return await getForeshadowing(projectId, result.id) ?? result
  }
  catch (error: unknown) {
    if (isMissing(error))
      return null
    throw error
  }
}

export async function deleteForeshadowing(
  projectId: string,
  id: string,
  options: ForeshadowingCommandOptions = {},
) {
  try {
    return await dispatchForeshadowingCommand<ForeshadowingSnapshot>(
      DELETE_FORESHADOWING_COMMAND,
      projectId,
      id,
      {},
      options,
    )
  }
  catch (error: unknown) {
    if (isMissing(error))
      return null
    throw error
  }
}

export async function listForeshadowingCharacters(projectId: string, foreshadowingId: string) {
  if (!await getForeshadowing(projectId, foreshadowingId))
    throw new Error('伏笔不属于当前项目')
  return db.select().from(foreshadowingCharacters).where(and(
    eq(foreshadowingCharacters.projectId, projectId),
    eq(foreshadowingCharacters.foreshadowingId, foreshadowingId),
  ))
}

export async function replaceForeshadowingCharacters(
  projectId: string,
  foreshadowingId: string,
  input: ForeshadowingCharacterInput[],
  options: ForeshadowingCommandOptions = {},
) {
  await dispatchForeshadowingCommand(
    REPLACE_FORESHADOWING_CHARACTERS_COMMAND,
    projectId,
    foreshadowingId,
    {
      characters: input.map(item => ({
        id: generateId(),
        characterId: item.characterId,
        relationType: item.relationType || 'related',
      })),
    },
    options,
  )
}

async function getForeshadowing(projectId: string, id: string) {
  const [row] = await db.select().from(foreshadowingItems).where(and(
    eq(foreshadowingItems.id, id),
    eq(foreshadowingItems.projectId, projectId),
  )).limit(1)
  return row ?? null
}

function isMissing(error: unknown): boolean {
  return error instanceof DomainCommandError
    && (error.code === 'FORESHADOWING_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
}
