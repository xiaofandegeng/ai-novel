import type { CreateTripleInput, StoryFactTriple, UpdateTripleInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchTriples(projectId: string) {
  return apiGet<StoryFactTriple[]>(`/api/projects/${projectId}/triples`)
}

export function createTriple(projectId: string, data: CreateTripleInput) {
  return apiPost<StoryFactTriple>(`/api/projects/${projectId}/triples`, data)
}

export function updateTriple(projectId: string, id: string, data: UpdateTripleInput) {
  return apiPatch<StoryFactTriple>(`/api/projects/${projectId}/triples/${id}`, data)
}

export function deleteTriple(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/triples/${id}`)
}
