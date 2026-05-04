import type { CreateForeshadowingInput, ForeshadowingItem, UpdateForeshadowingInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchForeshadowingItems(projectId: string) {
  return apiGet<ForeshadowingItem[]>(`/api/projects/${projectId}/foreshadowing`)
}

export function createForeshadowingItem(projectId: string, data: CreateForeshadowingInput) {
  return apiPost<ForeshadowingItem>(`/api/projects/${projectId}/foreshadowing`, data)
}

export function updateForeshadowingItem(projectId: string, id: string, data: UpdateForeshadowingInput) {
  return apiPatch<ForeshadowingItem>(`/api/projects/${projectId}/foreshadowing/${id}`, data)
}

export function deleteForeshadowingItem(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/foreshadowing/${id}`)
}
