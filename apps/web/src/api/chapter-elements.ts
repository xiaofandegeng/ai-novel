import type { ChapterElement, CreateChapterElementInput, UpdateChapterElementInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost, apiPut } from './client'

export function fetchChapterElements(projectId: string, chapterId: string) {
  return apiGet<ChapterElement[]>(`/api/projects/${projectId}/chapters/${chapterId}/elements`)
}

export function createChapterElement(projectId: string, chapterId: string, data: CreateChapterElementInput) {
  return apiPost<ChapterElement>(`/api/projects/${projectId}/chapters/${chapterId}/elements`, data)
}

export function replaceChapterElements(projectId: string, chapterId: string, data: { elements: CreateChapterElementInput[] }) {
  return apiPut<ChapterElement[]>(`/api/projects/${projectId}/chapters/${chapterId}/elements`, data)
}

export function updateChapterElement(projectId: string, chapterId: string, id: string, data: UpdateChapterElementInput) {
  return apiPatch<ChapterElement>(`/api/projects/${projectId}/chapters/${chapterId}/elements/${id}`, data)
}

export function deleteChapterElement(projectId: string, chapterId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/chapters/${chapterId}/elements/${id}`)
}
