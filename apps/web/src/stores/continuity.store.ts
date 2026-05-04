import type { ContinuityReport } from '../api/continuity'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/continuity'

export const useContinuityStore = defineStore('continuity', () => {
  const report = ref<ContinuityReport | null>(null)
  const analyzing = ref(false)

  async function analyze(projectId: string) {
    analyzing.value = true
    try {
      report.value = await api.analyzeContinuity(projectId)
    }
    finally {
      analyzing.value = false
    }
  }

  function clear() {
    report.value = null
  }

  return { report, analyzing, analyze, clear }
})
