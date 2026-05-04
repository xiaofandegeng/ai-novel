import type { AIContextSnapshot } from '@ai-novel/shared'
import { apiGet } from './client'

export function fetchContextSnapshots(projectId: string) {
  return apiGet<AIContextSnapshot[]>(`/api/projects/${projectId}/context-snapshots`)
}

export function fetchContextSnapshot(projectId: string, id: string) {
  return apiGet<AIContextSnapshot>(`/api/projects/${projectId}/context-snapshots/${id}`)
}
