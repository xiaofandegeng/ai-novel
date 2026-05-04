import type { Act, CreateActInput, UpdateActInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchActs(projectId: string) {
  return apiGet<Act[]>(`/api/projects/${projectId}/acts`)
}

export function createAct(projectId: string, data: CreateActInput) {
  return apiPost<Act>(`/api/projects/${projectId}/acts`, data)
}

export function updateAct(projectId: string, id: string, data: UpdateActInput) {
  return apiPatch<Act>(`/api/projects/${projectId}/acts/${id}`, data)
}

export function deleteAct(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/acts/${id}`)
}
