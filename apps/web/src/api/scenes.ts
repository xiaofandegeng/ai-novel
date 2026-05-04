import type { ChapterScene, CreateSceneInput, UpdateSceneInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchScenes(projectId: string, chapterId: string) {
  return apiGet<ChapterScene[]>(`/api/projects/${projectId}/chapters/${chapterId}/scenes`)
}

export function createScene(projectId: string, chapterId: string, data: CreateSceneInput) {
  return apiPost<ChapterScene>(`/api/projects/${projectId}/chapters/${chapterId}/scenes`, data)
}

export function updateScene(projectId: string, chapterId: string, id: string, data: UpdateSceneInput) {
  return apiPatch<ChapterScene>(`/api/projects/${projectId}/chapters/${chapterId}/scenes/${id}`, data)
}

export function deleteScene(projectId: string, chapterId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/chapters/${chapterId}/scenes/${id}`)
}
