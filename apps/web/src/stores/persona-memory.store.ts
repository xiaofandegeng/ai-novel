import type { PersonaMemoryFragment } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/persona-memory'

export const usePersonaMemoryStore = defineStore('personaMemory', () => {
  const fragments = ref<PersonaMemoryFragment[]>([])
  const extracting = ref(false)

  async function fetchFragments(projectId: string, type?: string) {
    fragments.value = await api.fetchFragments(projectId, type)
  }

  async function extractPatterns(projectId: string, chapterIds?: string[]) {
    extracting.value = true
    try {
      const created = await api.extractPatterns(projectId, chapterIds)
      fragments.value.push(...created)
      return created
    }
    finally {
      extracting.value = false
    }
  }

  return { fragments, extracting, fetchFragments, extractPatterns }
})
