import type { CreateStoryBibleInput, StoryBible } from '@ai-novel/shared'
import { apiGet, apiPatch, apiPost } from './client'

export function fetchStoryBible(projectId: string) {
  return apiGet<StoryBible>(`/api/projects/${projectId}/story-bible`)
}

export function createStoryBible(projectId: string, data: CreateStoryBibleInput) {
  return apiPost<StoryBible>(`/api/projects/${projectId}/story-bible`, data)
}

export function updateStoryBible(projectId: string, data: CreateStoryBibleInput) {
  return apiPatch<StoryBible>(`/api/projects/${projectId}/story-bible`, data)
}
