import type { CharacterRelationship, CreateRelationshipInput, UpdateRelationshipInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchRelationships(projectId: string) {
  return apiGet<CharacterRelationship[]>(`/api/projects/${projectId}/relationships`)
}

export function createRelationship(projectId: string, data: CreateRelationshipInput) {
  return apiPost<CharacterRelationship>(`/api/projects/${projectId}/relationships`, data)
}

export function updateRelationship(projectId: string, id: string, data: UpdateRelationshipInput) {
  return apiPatch<CharacterRelationship>(`/api/projects/${projectId}/relationships/${id}`, data)
}

export function deleteRelationship(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/relationships/${id}`)
}
