import type { Character, CreateCharacterInput, UpdateCharacterInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchCharacters(projectId: string) {
  return apiGet<Character[]>(`/api/projects/${projectId}/characters`)
}

export function createCharacter(projectId: string, data: CreateCharacterInput) {
  return apiPost<Character>(`/api/projects/${projectId}/characters`, data)
}

export function updateCharacter(projectId: string, id: string, data: UpdateCharacterInput) {
  return apiPatch<Character>(`/api/projects/${projectId}/characters/${id}`, data)
}

export function deleteCharacter(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/characters/${id}`)
}

export function inferRelationships(projectId: string) {
  return apiPost<{ suggestionsCreated: number, message: string }>(`/api/projects/${projectId}/characters/infer-relationships`, {})
}
