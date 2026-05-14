import type { StoryStructureTemplate } from '@ai-novel/shared'
import { client } from './client'

export const storyStructureApi = {
  listTemplates: (genre?: string) => {
    const query = genre ? `?genre=${genre}` : ''
    return client.get<StoryStructureTemplate[]>(`/story-structure/templates${query}`)
  },

  applyTemplate: (projectId: string, templateId: string) =>
    client.post(`/projects/${projectId}/story-structure/apply`, { templateId }),
}
