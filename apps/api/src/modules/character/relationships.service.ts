import type { CreateRelationshipInput, UpdateRelationshipInput } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { characterRelationships } from '../../db/schema'
import { assertCharactersBelongToProject } from '../../shared/ownership'
import { generateId, updatedFields } from '../../shared/utils'
import { normalizeCharacterPair } from './character-utils.service'

type RelationshipUpdate = UpdateRelationshipInput & {
  characterAId?: string
  characterBId?: string
}

export function listRelationships(projectId: string) {
  return db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
}

export async function createRelationship(projectId: string, input: CreateRelationshipInput) {
  const { characterAId, characterBId } = input
  if (!characterAId || !characterBId || characterAId === characterBId)
    return { row: null, error: '无效的角色ID' }

  try {
    await assertCharactersBelongToProject(projectId, [characterAId, characterBId])
  }
  catch {
    return { row: null, error: '角色不属于当前项目' }
  }

  const [lowId, highId] = normalizeCharacterPair(characterAId, characterBId)
  const [existing] = await db.select().from(characterRelationships).where(and(
    eq(characterRelationships.projectId, projectId),
    eq(characterRelationships.characterAId, lowId),
    eq(characterRelationships.characterBId, highId),
  ))
  if (existing)
    return { row: null, error: '该对角色之间已存在关系' }

  const [row] = await db.insert(characterRelationships).values({
    id: generateId(),
    projectId,
    characterAId: lowId,
    characterBId: highId,
    type: input.type,
    strength: input.strength,
    status: input.status,
    description: input.description,
  }).returning()
  return { row, error: null }
}

export async function updateRelationship(projectId: string, id: string, input: RelationshipUpdate) {
  const characterIds = [input.characterAId, input.characterBId].filter((value): value is string => Boolean(value))
  if (characterIds.length > 0) {
    try {
      await assertCharactersBelongToProject(projectId, characterIds)
    }
    catch {
      return { row: null, error: '角色不属于当前项目' }
    }
  }

  const [row] = await db.update(characterRelationships).set(updatedFields({
    characterAId: input.characterAId,
    characterBId: input.characterBId,
    type: input.type,
    strength: input.strength,
    status: input.status,
    description: input.description,
  })).where(and(
    eq(characterRelationships.id, id),
    eq(characterRelationships.projectId, projectId),
  )).returning()
  return { row: row ?? null, error: null }
}

export async function deleteRelationship(projectId: string, id: string) {
  const [row] = await db.delete(characterRelationships).where(and(
    eq(characterRelationships.id, id),
    eq(characterRelationships.projectId, projectId),
  )).returning()
  return row ?? null
}
