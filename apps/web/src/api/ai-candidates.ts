import type { AIGenerationCandidate, CreateAICandidateInput } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export function fetchAICandidates(
  projectId: string,
  filters?: { chapterId?: string, taskType?: string },
): Promise<AIGenerationCandidate[]> {
  const params = new URLSearchParams()
  if (filters?.chapterId)
    params.set('chapterId', filters.chapterId)
  if (filters?.taskType)
    params.set('taskType', filters.taskType)
  const query = params.toString()
  const url = query
    ? `/api/projects/${projectId}/ai-candidates?${query}`
    : `/api/projects/${projectId}/ai-candidates`
  return apiGet<AIGenerationCandidate[]>(url)
}

export function createAICandidate(
  projectId: string,
  data: CreateAICandidateInput,
): Promise<AIGenerationCandidate> {
  return apiPost<AIGenerationCandidate>(`/api/projects/${projectId}/ai-candidates`, data)
}

export function selectAICandidate(
  projectId: string,
  candidateId: string,
): Promise<AIGenerationCandidate> {
  return apiPost<AIGenerationCandidate>(`/api/projects/${projectId}/ai-candidates/${candidateId}/select`, {})
}

export function rateAICandidate(
  projectId: string,
  candidateId: string,
  rating: number,
): Promise<AIGenerationCandidate> {
  return apiPost<AIGenerationCandidate>(`/api/projects/${projectId}/ai-candidates/${candidateId}/rate`, { rating })
}
