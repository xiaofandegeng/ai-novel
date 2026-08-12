import type { CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import type { ConflictCommandOptions } from './conflict.commands'
import type { ConflictSnapshot } from './conflict.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { conflictParticipants, conflicts } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { matchCharacterIdsFromText } from '../character/character-utils.service'
import { compactConflictPayload, dispatchConflictCommand } from './conflict.commands'
import {
  CHANGE_CONFLICT_COMMAND,
  CREATE_CONFLICT_COMMAND,
  DELETE_CONFLICT_COMMAND,
  REPLACE_CONFLICT_PARTICIPANTS_COMMAND,
} from './conflict.eventing'

type ConflictInput = CreateConflictInput & { participantIds?: string[] }
type ConflictUpdate = UpdateConflictInput & { participantIds?: string[] }

export interface ConflictParticipantInput {
  characterId: string
  roleInConflict?: string
}

export function listConflicts(projectId: string) {
  return db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
}

export async function createConflict(
  projectId: string,
  input: ConflictInput,
  options: ConflictCommandOptions = {},
) {
  const participantIds = input.participantIds?.length
    ? input.participantIds
    : await matchCharacterIdsFromText(projectId, input.participants ?? null)
  const id = generateId()
  const result = await dispatchConflictCommand<ConflictSnapshot>(
    CREATE_CONFLICT_COMMAND,
    projectId,
    id,
    compactConflictPayload({ ...input, participantIds: participantIds ?? undefined }),
    options,
  )
  return await getConflict(projectId, result.id) ?? result
}

export async function updateConflict(
  projectId: string,
  id: string,
  input: ConflictUpdate,
  options: ConflictCommandOptions = {},
) {
  const participantIds = input.participants !== undefined && !input.participantIds?.length
    ? await matchCharacterIdsFromText(projectId, input.participants)
    : input.participantIds
  try {
    const result = await dispatchConflictCommand<ConflictSnapshot>(
      CHANGE_CONFLICT_COMMAND,
      projectId,
      id,
      compactConflictPayload({ ...input, participantIds: participantIds ?? undefined }),
      options,
    )
    return await getConflict(projectId, result.id) ?? result
  }
  catch (error: unknown) {
    if (isConflictMissing(error))
      return null
    throw error
  }
}

export async function deleteConflict(
  projectId: string,
  id: string,
  options: ConflictCommandOptions = {},
) {
  try {
    return await dispatchConflictCommand<ConflictSnapshot>(
      DELETE_CONFLICT_COMMAND,
      projectId,
      id,
      {},
      options,
    )
  }
  catch (error: unknown) {
    if (isConflictMissing(error))
      return null
    throw error
  }
}

export async function listConflictParticipants(projectId: string, conflictId: string) {
  if (!await getConflict(projectId, conflictId))
    throw new Error('矛盾不属于当前项目')
  return db.select().from(conflictParticipants).where(and(
    eq(conflictParticipants.projectId, projectId),
    eq(conflictParticipants.conflictId, conflictId),
  ))
}

export async function replaceConflictParticipants(
  projectId: string,
  conflictId: string,
  input: ConflictParticipantInput[],
  options: ConflictCommandOptions = {},
) {
  await dispatchConflictCommand(
    REPLACE_CONFLICT_PARTICIPANTS_COMMAND,
    projectId,
    conflictId,
    {
      participants: input.map(item => ({
        id: generateId(),
        characterId: item.characterId,
        roleInConflict: item.roleInConflict ?? null,
      })),
    },
    options,
  )
}

async function getConflict(projectId: string, id: string) {
  const [row] = await db.select().from(conflicts).where(and(
    eq(conflicts.id, id),
    eq(conflicts.projectId, projectId),
  )).limit(1)
  return row ?? null
}

function isConflictMissing(error: unknown): boolean {
  return error instanceof DomainCommandError
    && (error.code === 'CONFLICT_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
}
