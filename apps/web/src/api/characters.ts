import type { Character, CreateCharacterInput, UpdateCharacterInput } from '@ai-novel/shared'
import { apiPost, createCrudApi } from './client'

const crud = createCrudApi<Character, CreateCharacterInput, UpdateCharacterInput>('characters')

export const fetchCharacters = crud.fetch
export const createCharacter = crud.create
export const updateCharacter = crud.update
export const deleteCharacter = crud.delete

export function inferRelationships(projectId: string) {
  return apiPost<{ suggestionsCreated: number, message: string }>(`/api/projects/${projectId}/characters/infer-relationships`, {})
}

export function autoLinkCharacter(projectId: string, id: string) {
  return apiPost<{ suggestionsCreated: number, message: string }>(`/api/projects/${projectId}/characters/${id}/auto-link`, {})
}
