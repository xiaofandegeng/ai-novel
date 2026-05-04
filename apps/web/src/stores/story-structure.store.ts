import type { StoryStructureTemplate } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/story-structure'

export const useStoryStructureStore = defineStore('storyStructure', () => {
  const templates = ref<StoryStructureTemplate[]>([])

  async function fetchTemplates(genre?: string) {
    templates.value = await api.fetchTemplates(genre)
  }

  async function applyTemplate(projectId: string, templateId: string) {
    return api.applyTemplate(projectId, templateId)
  }

  return { templates, fetchTemplates, applyTemplate }
})
