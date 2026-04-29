import type { Chapter, CreateChapterInput, UpdateChapterInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchChapters(projectId: string) {
  return apiGet<Chapter[]>(`/api/projects/${projectId}/chapters`)
}

export function createChapter(projectId: string, data: CreateChapterInput) {
  return apiPost<Chapter>(`/api/projects/${projectId}/chapters`, data)
}

export function updateChapter(projectId: string, id: string, data: UpdateChapterInput) {
  return apiPatch<Chapter>(`/api/projects/${projectId}/chapters/${id}`, data)
}

export function deleteChapter(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/chapters/${id}`)
}
