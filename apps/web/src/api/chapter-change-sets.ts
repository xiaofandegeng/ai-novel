import type { ChapterChangeSet, ChapterChangeSetItem } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export interface ChapterChangeSetDetail extends ChapterChangeSet {
  items: ChapterChangeSetItem[]
}

export function fetchChapterChangeSets(projectId: string, chapterId: string) {
  return apiGet<ChapterChangeSet[]>(`/api/projects/${projectId}/chapters/${chapterId}/change-sets`)
}

export function fetchChangeSetDetail(projectId: string, id: string) {
  return apiGet<ChapterChangeSetDetail>(`/api/projects/${projectId}/change-sets/${id}`)
}

export function approveChangeSet(projectId: string, id: string) {
  return apiPost<{ success: boolean }>(`/api/projects/${projectId}/change-sets/${id}/approve`, {})
}

export function applyChangeSet(projectId: string, id: string) {
  return apiPost<{ success: boolean }>(`/api/projects/${projectId}/change-sets/${id}/apply`, {})
}
