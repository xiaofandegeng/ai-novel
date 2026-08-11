import type { CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { conflictParticipants, conflicts } from '../../db/schema'
import { assertCharactersBelongToProject, assertConflictBelongsToProject } from '../../shared/ownership'
import { generateId, updatedFields } from '../../shared/utils'
import { matchCharacterIdsFromText } from '../character/character-utils.service'

type ConflictInput = CreateConflictInput & { participantIds?: string[] }
type ConflictUpdate = UpdateConflictInput & { participantIds?: string[] }

export interface ConflictParticipantInput {
  characterId: string
  roleInConflict?: string
}

export function listConflicts(projectId: string) {
  return db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
}

export async function createConflict(projectId: string, input: ConflictInput) {
  const participantIds = input.participantIds?.length
    ? input.participantIds
    : await matchCharacterIdsFromText(projectId, input.participants ?? null)
  const [row] = await db.insert(conflicts).values({
    id: generateId(),
    projectId,
    title: input.title,
    type: input.type,
    intensity: input.intensity,
    status: input.status,
    participants: input.participants,
    participantIds: participantIds ? JSON.stringify(participantIds) : null,
    description: input.description,
    resolution: input.resolution,
  }).returning()
  return row
}

export async function updateConflict(projectId: string, id: string, input: ConflictUpdate) {
  const participantIds = input.participants !== undefined && !input.participantIds?.length
    ? await matchCharacterIdsFromText(projectId, input.participants)
    : input.participantIds
  const [row] = await db.update(conflicts).set(updatedFields({
    title: input.title,
    type: input.type,
    intensity: input.intensity,
    status: input.status,
    participants: input.participants,
    participantIds: participantIds ? JSON.stringify(participantIds) : undefined,
    description: input.description,
    resolution: input.resolution,
  })).where(and(eq(conflicts.id, id), eq(conflicts.projectId, projectId))).returning()
  return row ?? null
}

export async function deleteConflict(projectId: string, id: string) {
  const [row] = await db.delete(conflicts).where(and(
    eq(conflicts.id, id),
    eq(conflicts.projectId, projectId),
  )).returning()
  return row ?? null
}

export async function listConflictParticipants(projectId: string, conflictId: string) {
  await assertConflictBelongsToProject(projectId, conflictId)
  return db.select().from(conflictParticipants).where(and(
    eq(conflictParticipants.projectId, projectId),
    eq(conflictParticipants.conflictId, conflictId),
  ))
}

export async function replaceConflictParticipants(
  projectId: string,
  conflictId: string,
  input: ConflictParticipantInput[],
) {
  await assertConflictBelongsToProject(projectId, conflictId)
  await assertCharactersBelongToProject(projectId, input.map(item => item.characterId))
  await db.transaction(async (tx) => {
    await tx.delete(conflictParticipants).where(and(
      eq(conflictParticipants.projectId, projectId),
      eq(conflictParticipants.conflictId, conflictId),
    ))
    if (input.length > 0) {
      await tx.insert(conflictParticipants).values(input.map(item => ({
        id: generateId(),
        projectId,
        conflictId,
        characterId: item.characterId,
        roleInConflict: item.roleInConflict || null,
      })))
    }
  })
}
