import type { Chapter, CreateChapterInput, UpdateChapterInput } from '@ai-novel/shared'
import { apiPost, createCrudApi } from './client'

const crud = createCrudApi<Chapter, CreateChapterInput, UpdateChapterInput>('chapters')

export const fetchChapters = crud.fetch
export const createChapter = crud.create
export const updateChapter = crud.update
export const deleteChapter = crud.delete

export function autoPlanScenes(projectId: string, chapterId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/api/projects/${projectId}/chapters/${chapterId}/auto-plan-scenes`, {})
}
