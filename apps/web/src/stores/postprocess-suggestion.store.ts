import type { PostprocessSuggestion } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/postprocess-suggestions'

export const usePostprocessSuggestionStore = defineStore('postprocessSuggestions', () => {
  const suggestions = ref<PostprocessSuggestion[]>([])

  async function fetchSuggestions(projectId: string, chapterId: string, runId?: string) {
    suggestions.value = await api.fetchSuggestions(projectId, chapterId, runId)
  }

  async function accept(projectId: string, id: string) {
    const row = await api.acceptSuggestion(projectId, id)
    const idx = suggestions.value.findIndex(s => s.id === id)
    if (idx !== -1)
      suggestions.value[idx] = row
    return row
  }

  async function reject(projectId: string, id: string) {
    const row = await api.rejectSuggestion(projectId, id)
    const idx = suggestions.value.findIndex(s => s.id === id)
    if (idx !== -1)
      suggestions.value[idx] = row
    return row
  }

  async function applyAccepted(projectId: string, chapterId: string) {
    const result = await api.applyAcceptedSuggestions(projectId, chapterId)
    await fetchSuggestions(projectId, chapterId)
    return result
  }

  async function runInference(projectId: string) {
    return api.runInference(projectId)
  }

  return { suggestions, fetchSuggestions, accept, reject, applyAccepted, runInference }
})
