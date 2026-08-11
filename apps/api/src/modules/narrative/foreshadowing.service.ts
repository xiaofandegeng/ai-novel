import type { CreateForeshadowingInput, UpdateForeshadowingInput } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { foreshadowingCharacters, foreshadowingItems } from '../../db/schema'
import { assertCharactersBelongToProject, assertForeshadowingBelongsToProject, assertOptionalChapterBelongsToProject } from '../../shared/ownership'
import { generateId, updatedFields } from '../../shared/utils'
import { matchCharacterIdsFromText } from '../character/character-utils.service'

export interface ForeshadowingCharacterInput {
  characterId: string
  relationType: 'protagonist' | 'antagonist' | 'victim' | 'witness' | 'related'
}

async function assertChapterReferences(projectId: string, input: UpdateForeshadowingInput) {
  await assertOptionalChapterBelongsToProject(projectId, input.setupChapterId)
  await assertOptionalChapterBelongsToProject(projectId, input.expectedPayoffChapterId)
  await assertOptionalChapterBelongsToProject(projectId, input.payoffChapterId)
}

export function listForeshadowing(projectId: string) {
  return db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
}

export async function createForeshadowing(projectId: string, input: CreateForeshadowingInput) {
  await assertChapterReferences(projectId, input)
  const characterIds = input.characterIds?.length
    ? input.characterIds
    : await matchCharacterIdsFromText(projectId, input.relatedCharacters ?? null)
  const [row] = await db.insert(foreshadowingItems).values({
    id: generateId(),
    projectId,
    title: input.title,
    description: input.description,
    setupChapterId: input.setupChapterId,
    expectedPayoffChapterId: input.expectedPayoffChapterId,
    payoffChapterId: input.payoffChapterId,
    status: input.status || 'open',
    importance: input.importance || 'normal',
    relatedCharacters: input.relatedCharacters,
    characterIds: characterIds ? JSON.stringify(characterIds) : null,
    relatedEvents: input.relatedEvents,
    notes: input.notes,
  }).returning()
  return row
}

export async function updateForeshadowing(projectId: string, id: string, input: UpdateForeshadowingInput) {
  await assertChapterReferences(projectId, input)
  const characterIds = input.relatedCharacters !== undefined && !input.characterIds?.length
    ? await matchCharacterIdsFromText(projectId, input.relatedCharacters)
    : input.characterIds
  const [row] = await db.update(foreshadowingItems).set(updatedFields({
    title: input.title,
    description: input.description,
    setupChapterId: input.setupChapterId,
    expectedPayoffChapterId: input.expectedPayoffChapterId,
    payoffChapterId: input.payoffChapterId,
    status: input.status,
    importance: input.importance,
    relatedCharacters: input.relatedCharacters,
    characterIds: characterIds ? JSON.stringify(characterIds) : undefined,
    relatedEvents: input.relatedEvents,
    notes: input.notes,
  })).where(and(
    eq(foreshadowingItems.id, id),
    eq(foreshadowingItems.projectId, projectId),
  )).returning()
  return row ?? null
}

export async function deleteForeshadowing(projectId: string, id: string) {
  const [row] = await db.delete(foreshadowingItems).where(and(
    eq(foreshadowingItems.id, id),
    eq(foreshadowingItems.projectId, projectId),
  )).returning()
  return row ?? null
}

export async function listForeshadowingCharacters(projectId: string, foreshadowingId: string) {
  await assertForeshadowingBelongsToProject(projectId, foreshadowingId)
  return db.select().from(foreshadowingCharacters).where(and(
    eq(foreshadowingCharacters.projectId, projectId),
    eq(foreshadowingCharacters.foreshadowingId, foreshadowingId),
  ))
}

export async function replaceForeshadowingCharacters(
  projectId: string,
  foreshadowingId: string,
  input: ForeshadowingCharacterInput[],
) {
  await assertForeshadowingBelongsToProject(projectId, foreshadowingId)
  await assertCharactersBelongToProject(projectId, input.map(item => item.characterId))
  await db.transaction(async (tx) => {
    await tx.delete(foreshadowingCharacters).where(and(
      eq(foreshadowingCharacters.projectId, projectId),
      eq(foreshadowingCharacters.foreshadowingId, foreshadowingId),
    ))
    if (input.length > 0) {
      await tx.insert(foreshadowingCharacters).values(input.map(item => ({
        id: generateId(),
        projectId,
        foreshadowingId,
        characterId: item.characterId,
        relationType: item.relationType || 'related',
      })))
    }
  })
}
