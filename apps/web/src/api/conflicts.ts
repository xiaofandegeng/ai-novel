import type { Conflict, CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchConflicts(projectId: string) {
  return apiGet<Conflict[]>(`/api/projects/${projectId}/conflicts`)
}

export function createConflict(projectId: string, data: CreateConflictInput) {
  return apiPost<Conflict>(`/api/projects/${projectId}/conflicts`, data)
}

export function updateConflict(projectId: string, id: string, data: UpdateConflictInput) {
  return apiPatch<Conflict>(`/api/projects/${projectId}/conflicts/${id}`, data)
}

export function deleteConflict(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/conflicts/${id}`)
}
