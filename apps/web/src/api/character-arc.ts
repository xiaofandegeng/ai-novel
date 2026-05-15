import type { CharacterArcEvent, CreateCharacterArcEventInput, UpdateCharacterArcEventInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchCharacterTimeline(projectId: string, characterId: string) {
  return apiGet<CharacterArcEvent[]>(`/api/projects/${projectId}/character-arc/${characterId}`)
}

export function fetchCharacterArcProjectTimeline(projectId: string) {
  return apiGet<CharacterArcEvent[]>(`/api/projects/${projectId}/character-arc`)
}

export function createArcEvent(projectId: string, data: CreateCharacterArcEventInput) {
  return apiPost<CharacterArcEvent>(`/api/projects/${projectId}/character-arc`, data)
}

export function updateArcEvent(projectId: string, id: string, data: UpdateCharacterArcEventInput) {
  return apiPatch<CharacterArcEvent>(`/api/projects/${projectId}/character-arc/${id}`, data)
}

export function deleteArcEvent(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/character-arc/${id}`)
}
