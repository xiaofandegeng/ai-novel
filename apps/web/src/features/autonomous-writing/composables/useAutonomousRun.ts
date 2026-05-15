import type { AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { computed, onUnmounted, ref } from 'vue'
import {
  createAutonomousRun as apiCreateRun,
  ignoreAutonomousException as apiIgnoreException,
  resolveAutonomousException as apiResolveException,
  fetchActiveAutonomousRun,
  fetchAutonomousExceptions,
  fetchAutonomousRun,
  pauseAutonomousRun,
  resumeAutonomousRun,
  startAutonomousRun,
} from '@/api/autonomous-runs'

export function useAutonomousRun(projectId: string) {
  const currentRun = ref<(AutonomousWritingRun & { jobs: any[] }) | null>(null)
  const exceptions = ref<any[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const timer = ref<any>(null)

  async function loadActiveRun() {
    loading.value = true
    error.value = null
    try {
      const activeRun = await fetchActiveAutonomousRun(projectId)
      if (activeRun) {
        currentRun.value = activeRun
        if (activeRun.status === 'running') {
          startPolling(activeRun.id)
        }
        else if (activeRun.status === 'needs_attention') {
          await loadExceptions(activeRun.id)
        }
      }
    }
    catch (err: any) {
      console.error('Failed to load active run', err)
    }
    finally {
      loading.value = false
    }
  }

  async function loadRun(runId: string) {
    loading.value = true
    error.value = null
    try {
      currentRun.value = await fetchAutonomousRun(projectId, runId)
      if (currentRun.value?.status === 'needs_attention') {
        await loadExceptions(runId)
      }
    }
    catch (err: any) {
      error.value = err.message || '加载自动驾驶任务失败'
    }
    finally {
      loading.value = false
    }
  }

  async function loadExceptions(runId: string) {
    try {
      exceptions.value = await fetchAutonomousExceptions(projectId, runId)
    }
    catch (e) {
      console.error('Failed to load exceptions', e)
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

  async function resolveException(runId: string, exceptionId: string, resolution: string) {
    try {
      await apiResolveException(projectId, runId, exceptionId, resolution)
      await loadRun(runId)
      await loadExceptions(runId)
      // If run becomes running again, restart polling
      if (currentRun.value?.status === 'running') {
        startPolling(runId)
      }
    }
    catch (err: any) {
      error.value = err.message || '处理异常失败'
    }
  }

  async function ignoreException(runId: string, exceptionId: string) {
    try {
      await apiIgnoreException(projectId, runId, exceptionId)
      await loadRun(runId)
      await loadExceptions(runId)
      if (currentRun.value?.status === 'running') {
        startPolling(runId)
      }
    }
    catch (err: any) {
      error.value = err.message || '忽略异常失败'
    }
  }

  function startPolling(runId: string) {
    stopPolling()
    timer.value = setInterval(async () => {
      try {
        currentRun.value = await fetchAutonomousRun(projectId, runId)

        if (currentRun.value?.status === 'needs_attention') {
          await loadExceptions(runId)
        }

        const terminalStatuses = ['completed', 'failed', 'paused', 'needs_attention']
        if (currentRun.value && terminalStatuses.includes(currentRun.value.status)) {
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
    exceptions,
    loading,
    error,
    createRun,
    loadRun,
    loadActiveRun,
    loadExceptions,
    start,
    pause,
    resume,
    resolveException,
    ignoreException,
    isPolling: computed(() => !!timer.value),
  }
}
