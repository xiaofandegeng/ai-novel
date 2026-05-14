import type { CreateForeshadowingInput, ForeshadowingItem, UpdateForeshadowingInput } from '@ai-novel/shared'
import { apiGet, apiPut, createCrudApi } from './client'

const crud = createCrudApi<ForeshadowingItem, CreateForeshadowingInput, UpdateForeshadowingInput>('foreshadowing')

export const fetchForeshadowingItems = crud.fetch
export const createForeshadowingItem = crud.create
export const updateForeshadowingItem = crud.update
export const deleteForeshadowingItem = crud.delete

export async function fetchCharacters(projectId: string, id: string) {
  return apiGet(`/api/projects/${projectId}/foreshadowing/${id}/characters`)
}

export async function updateCharacters(projectId: string, id: string, characters: Array<{ characterId: string, relationType?: string }>) {
  return apiPut(`/api/projects/${projectId}/foreshadowing/${id}/characters`, characters)
}
