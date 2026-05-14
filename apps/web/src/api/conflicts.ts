import type { Conflict, CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import { apiGet, apiPut, createCrudApi } from './client'

const crud = createCrudApi<Conflict, CreateConflictInput, UpdateConflictInput>('conflicts')

export const fetchConflicts = crud.fetch
export const createConflict = crud.create
export const updateConflict = crud.update
export const deleteConflict = crud.delete

export async function fetchParticipants(projectId: string, id: string) {
  return apiGet(`/api/projects/${projectId}/conflicts/${id}/participants`)
}

export async function updateParticipants(projectId: string, id: string, participants: Array<{ characterId: string, roleInConflict?: string }>) {
  return apiPut(`/api/projects/${projectId}/conflicts/${id}/participants`, participants)
}
