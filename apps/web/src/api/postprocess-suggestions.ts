import type { PostprocessSuggestion } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export function fetchSuggestions(projectId: string, chapterId: string, runId?: string) {
  const query = runId ? `?runId=${runId}` : ''
  return apiGet<PostprocessSuggestion[]>(`/api/projects/${projectId}/chapters/${chapterId}/suggestions${query}`)
}

export function acceptSuggestion(projectId: string, id: string) {
  return apiPost<PostprocessSuggestion>(`/api/projects/${projectId}/suggestions/${id}/accept`, {})
}

export function rejectSuggestion(projectId: string, id: string) {
  return apiPost<PostprocessSuggestion>(`/api/projects/${projectId}/suggestions/${id}/reject`, {})
}

export function applyAcceptedSuggestions(projectId: string, chapterId: string) {
  return apiPost<{ applied: number, acknowledged: number, failed: number, skipped: number }>(`/api/projects/${projectId}/chapters/${chapterId}/suggestions/apply-accepted`, {})
}

export function runInference(projectId: string) {
  return apiPost<{ suggestionsCreated: number }>(`/api/projects/${projectId}/inference/run`, {})
}
