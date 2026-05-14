import type { CreateWritingGoalInput, DailyWritingStats, UpdateWritingGoalInput, WritingGoal, WritingGoalProgress } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchGoals(projectId: string) {
  return apiGet<WritingGoal[]>(`/api/projects/${projectId}/writing-goals`)
}

export function fetchActiveGoals(projectId: string) {
  return apiGet<WritingGoal[]>(`/api/projects/${projectId}/writing-goals/active`)
}

export function createGoal(projectId: string, data: CreateWritingGoalInput) {
  return apiPost<WritingGoal>(`/api/projects/${projectId}/writing-goals`, data)
}

export function updateGoal(projectId: string, id: string, data: UpdateWritingGoalInput) {
  return apiPatch<WritingGoal>(`/api/projects/${projectId}/writing-goals/${id}`, data)
}

export function deleteGoal(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/writing-goals/${id}`)
}

export function fetchGoalProgress(projectId: string, id: string) {
  return apiGet<WritingGoalProgress>(`/api/projects/${projectId}/writing-goals/${id}/progress`)
}

export function fetchDailyStats(projectId: string, startDate?: string, endDate?: string) {
  const params = new URLSearchParams()
  if (startDate)
    params.set('startDate', startDate)
  if (endDate)
    params.set('endDate', endDate)
  const query = params.toString()
  return apiGet<DailyWritingStats[]>(`/api/projects/${projectId}/daily-stats${query ? `?${query}` : ''}`)
}

export function recordWritingActivity(projectId: string, data: {
  date: string
  wordsAdded?: number
  chaptersCompleted?: number
  aiWordsAccepted?: number
  manualWordsAdded?: number
}) {
  return apiPost<DailyWritingStats>(`/api/projects/${projectId}/daily-stats`, data)
}
