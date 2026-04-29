import type { ChapterVersion, CreateVersionInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPost } from './client'

export function fetchVersions(projectId: string, chapterId: string) {
  return apiGet<ChapterVersion[]>(`/api/projects/${projectId}/chapters/${chapterId}/versions`)
}

export function createSnapshot(projectId: string, chapterId: string, data: CreateVersionInput) {
  return apiPost<ChapterVersion>(`/api/projects/${projectId}/chapters/${chapterId}/versions`, data)
}

export function deleteVersion(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/versions/${id}`)
}
