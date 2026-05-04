import type { PersonaMemoryFragment } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export function fetchFragments(projectId: string, type?: string) {
  const query = type ? `?type=${type}` : ''
  return apiGet<PersonaMemoryFragment[]>(`/api/projects/${projectId}/persona-memory${query}`)
}

export function extractPatterns(projectId: string, chapterIds?: string[]) {
  return apiPost<PersonaMemoryFragment[]>(`/api/projects/${projectId}/persona-memory/extract`, { chapterIds })
}
