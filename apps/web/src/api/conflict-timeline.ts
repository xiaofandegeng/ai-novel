import type { ConflictTimelineEvent, CreateConflictTimelineEventInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPost } from './client'

export function fetchConflictTimeline(projectId: string, conflictId: string) {
  return apiGet<ConflictTimelineEvent[]>(`/api/projects/${projectId}/conflicts/${conflictId}/timeline`)
}

export function fetchConflictProjectTimeline(projectId: string) {
  return apiGet<ConflictTimelineEvent[]>(`/api/projects/${projectId}/conflict-timeline`)
}

export function createTimelineEvent(projectId: string, data: CreateConflictTimelineEventInput) {
  return apiPost<ConflictTimelineEvent>(`/api/projects/${projectId}/conflict-timeline`, data)
}

export function deleteTimelineEvent(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/conflict-timeline/${id}`)
}
