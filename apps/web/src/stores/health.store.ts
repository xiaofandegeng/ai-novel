import type { HealthMetrics } from '../api/health-metrics'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchHealthMetrics } from '../api/health-metrics'

export const useHealthStore = defineStore('health', () => {
  const metrics = ref<HealthMetrics | null>(null)

  async function fetchMetrics(projectId: string) {
    metrics.value = await fetchHealthMetrics(projectId)
  }

  return { metrics, fetchMetrics }
})
