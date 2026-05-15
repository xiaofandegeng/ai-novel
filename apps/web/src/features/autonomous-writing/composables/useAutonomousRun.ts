import type { AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { computed, onUnmounted, ref } from 'vue'
import {
  createAutonomousRun as apiCreateRun,
  fetchAutonomousRun,
  pauseAutonomousRun,
  resumeAutonomousRun,
  startAutonomousRun,
} from '@/api/autonomous-runs'

export function useAutonomousRun(projectId: string) {
  const currentRun = ref<(AutonomousWritingRun & { jobs: any[] }) | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const timer = ref<any>(null)

  async function loadRun(runId: string) {
    loading.value = true
    error.value = null
    try {
      currentRun.value = await fetchAutonomousRun(projectId, runId)
    }
    catch (err: any) {
      error.value = err.message || '加载自动驾驶任务失败'
    }
    finally {
      loading.value = false
    }
  }

  async function createRun(input: CreateAutonomousRunInput) {
    loading.value = true
    error.value = null
    try {
      const run = await apiCreateRun(projectId, input)
      await loadRun(run.id)
      return run
    }
    catch (err: any) {
      error.value = err.message || '创建自动驾驶任务失败'
      throw err
    }
    finally {
      loading.value = false
    }
  }

  async function start(runId: string) {
    try {
      await startAutonomousRun(projectId, runId)
      await loadRun(runId)
      startPolling(runId)
    }
    catch (err: any) {
      error.value = err.message || '启动失败'
    }
  }

  async function pause(runId: string) {
    try {
      await pauseAutonomousRun(projectId, runId)
      await loadRun(runId)
    }
    catch (err: any) {
      error.value = err.message || '暂停失败'
    }
  }

  async function resume(runId: string) {
    try {
      await resumeAutonomousRun(projectId, runId)
      await loadRun(runId)
      startPolling(runId)
    }
    catch (err: any) {
      error.value = err.message || '恢复失败'
    }
  }

  function startPolling(runId: string) {
    stopPolling()
    timer.value = setInterval(async () => {
      try {
        currentRun.value = await fetchAutonomousRun(projectId, runId)
        if (currentRun.value?.status === 'completed' || currentRun.value?.status === 'failed') {
          stopPolling()
        }
      }
      catch (e) {
        console.error('Polling error', e)
      }
    }, 3000)
  }

  function stopPolling() {
    if (timer.value) {
      clearInterval(timer.value)
      timer.value = null
    }
  }

  onUnmounted(stopPolling)

  return {
    currentRun,
    loading,
    error,
    createRun,
    loadRun,
    start,
    pause,
    resume,
    isPolling: computed(() => !!timer.value),
  }
}
