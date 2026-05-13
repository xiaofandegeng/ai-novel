import type { CharacterRelationship, CreateRelationshipInput, UpdateRelationshipInput } from '@ai-novel/shared'
import { createCrudApi } from './client'

const crud = createCrudApi<CharacterRelationship, CreateRelationshipInput, UpdateRelationshipInput>('relationships')

export const fetchRelationships = crud.fetch
export const createRelationship = crud.create
export const updateRelationship = crud.update
export const deleteRelationship = crud.delete
