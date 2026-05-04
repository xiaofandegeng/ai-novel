import type { AIContextSnapshot } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/ai-context-snapshots'

export const useAIContextSnapshotStore = defineStore('aiContextSnapshots', () => {
  const snapshots = ref<AIContextSnapshot[]>([])
  const selected = ref<AIContextSnapshot | null>(null)

  async function fetchSnapshots(projectId: string) {
    snapshots.value = await api.fetchContextSnapshots(projectId)
  }

  async function fetchSnapshot(projectId: string, id: string) {
    selected.value = await api.fetchContextSnapshot(projectId, id)
  }

  function clear() {
    snapshots.value = []
    selected.value = null
  }

  return { snapshots, selected, fetchSnapshots, fetchSnapshot, clear }
})
