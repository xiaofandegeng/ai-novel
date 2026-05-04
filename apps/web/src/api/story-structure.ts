import type { StoryStructureTemplate } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export function fetchTemplates(genre?: string) {
  const query = genre ? `?genre=${genre}` : ''
  return apiGet<StoryStructureTemplate[]>(`/api/story-structure/templates${query}`)
}

export function applyTemplate(projectId: string, templateId: string) {
  return apiPost(`/api/projects/${projectId}/story-structure/apply`, { templateId })
}
