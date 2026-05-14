import type { AIGenerationCandidate } from '@ai-novel/shared'
import { ref } from 'vue'
import {
  fetchAICandidates,
  rateAICandidate,
  selectAICandidate,
} from '../../../api/ai-candidates'

export function useMultiCandidate(projectId: string) {
  const candidates = ref<AIGenerationCandidate[]>([])
  const loading = ref(false)
  const selecting = ref(false)
  const rating = ref(false)

  async function loadCandidates(filters?: { chapterId?: string, taskType?: string }) {
    loading.value = true
    try {
      candidates.value = await fetchAICandidates(projectId, filters)
    }
    catch {
      candidates.value = []
    }
    finally {
      loading.value = false
    }
  }

  async function handleSelect(candidateId: string) {
    selecting.value = true
    try {
      const updated = await selectAICandidate(projectId, candidateId)
      const index = candidates.value.findIndex(c => c.id === candidateId)
      if (index !== -1) {
        // Clear previous selection in local state
        for (const c of candidates.value) {
          if (c.chapterId === updated.chapterId && c.taskType === updated.taskType) {
            c.userSelected = 0
          }
        }
        candidates.value[index] = updated
      }
      return updated
    }
    finally {
      selecting.value = false
    }
  }

  async function handleRate(candidateId: string, score: number) {
    rating.value = true
    try {
      const updated = await rateAICandidate(projectId, candidateId, score)
      const index = candidates.value.findIndex(c => c.id === candidateId)
      if (index !== -1) {
        candidates.value[index] = updated
      }
      return updated
    }
    finally {
      rating.value = false
    }
  }

  return {
    candidates,
    loading,
    selecting,
    rating,
    loadCandidates,
    handleSelect,
    handleRate,
  }
}
