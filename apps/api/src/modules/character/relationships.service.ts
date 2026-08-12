import type { CreateRelationshipInput, UpdateRelationshipInput } from '@ai-novel/shared'
import type { RelationshipCommandOptions } from './relationship.commands'
import type { RelationshipSnapshot } from './relationship.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { characterRelationships } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { compactRelationshipPayload, dispatchRelationshipCommand } from './relationship.commands'
import {
  CHANGE_RELATIONSHIP_COMMAND,
  CREATE_RELATIONSHIP_COMMAND,
  DELETE_RELATIONSHIP_COMMAND,
} from './relationship.eventing'

type RelationshipUpdate = UpdateRelationshipInput & {
  characterAId?: string
  characterBId?: string
}

export function listRelationships(projectId: string) {
  return db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
}

export async function createRelationship(
  projectId: string,
  input: CreateRelationshipInput,
  options: RelationshipCommandOptions = {},
) {
  try {
    const id = generateId()
    const result = await dispatchRelationshipCommand<RelationshipSnapshot>(
      CREATE_RELATIONSHIP_COMMAND,
      projectId,
      id,
      compactRelationshipPayload(input),
      options,
    )
    return { row: await getRelationship(projectId, result.id) ?? result, error: null }
  }
  catch (error: unknown) {
    return { row: null, error: relationshipErrorMessage(error) }
  }
}

export async function updateRelationship(
  projectId: string,
  id: string,
  input: RelationshipUpdate,
  options: RelationshipCommandOptions = {},
) {
  try {
    const result = await dispatchRelationshipCommand<RelationshipSnapshot>(
      CHANGE_RELATIONSHIP_COMMAND,
      projectId,
      id,
      compactRelationshipPayload(input),
      options,
    )
    return { row: await getRelationship(projectId, result.id) ?? result, error: null }
  }
  catch (error: unknown) {
    if (isRelationshipMissing(error))
      return { row: null, error: null }
    return { row: null, error: relationshipErrorMessage(error) }
  }
}

export async function deleteRelationship(
  projectId: string,
  id: string,
  options: RelationshipCommandOptions = {},
) {
  try {
    return await dispatchRelationshipCommand<RelationshipSnapshot>(
      DELETE_RELATIONSHIP_COMMAND,
      projectId,
      id,
      {},
      options,
    )
  }
  catch (error: unknown) {
    if (isRelationshipMissing(error))
      return null
    throw error
  }
}

async function getRelationship(projectId: string, id: string) {
  const [row] = await db.select().from(characterRelationships).where(and(
    eq(characterRelationships.id, id),
    eq(characterRelationships.projectId, projectId),
  )).limit(1)
  return row ?? null
}

function isRelationshipMissing(error: unknown): boolean {
  return error instanceof DomainCommandError
    && (error.code === 'RELATIONSHIP_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
}

function relationshipErrorMessage(error: unknown): string {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'INVALID_RELATIONSHIP_CHARACTERS' || error.code === 'INVALID_RELATIONSHIP')
    return '无效的角色ID'
  if (error.code === 'CHARACTER_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
    return '角色不属于当前项目'
  if (error.code === 'RELATIONSHIP_ALREADY_EXISTS')
    return '该对角色之间已存在关系'
  throw error
}
