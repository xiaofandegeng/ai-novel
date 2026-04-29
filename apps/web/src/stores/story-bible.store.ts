import type { StoryBible } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as storyBiblesApi from '../api/story-bibles'

export const useStoryBibleStore = defineStore('storyBible', () => {
  const storyBible = ref<StoryBible | null>(null)

  async function fetchStoryBible(projectId: string) {
    try {
      storyBible.value = await storyBiblesApi.fetchStoryBible(projectId)
    }
    catch {
      storyBible.value = null
    }
  }

  async function createStoryBible(projectId: string, data: Partial<StoryBible>) {
    storyBible.value = await storyBiblesApi.createStoryBible(projectId, data)
    return storyBible.value
  }

  async function updateStoryBible(projectId: string, data: Partial<StoryBible>) {
    storyBible.value = await storyBiblesApi.updateStoryBible(projectId, data)
    return storyBible.value
  }

  return { storyBible, fetchStoryBible, createStoryBible, updateStoryBible }
})
