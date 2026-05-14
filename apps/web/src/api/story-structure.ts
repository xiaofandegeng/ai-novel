import type { StoryStructureTemplate } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export const storyStructureApi = {
  listTemplates: (genre?: string) => {
    const query = genre ? `?genre=${genre}` : ''
    return apiGet<StoryStructureTemplate[]>(`/api/story-structure/templates${query}`)
  },

  applyTemplate: (projectId: string, templateId: string) =>
    apiPost(`/api/projects/${projectId}/story-structure/apply`, { templateId }),
}
