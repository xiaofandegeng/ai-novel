import type { AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { computed, onUnmounted, ref } from 'vue'
import {
  abandonAutonomousRun as apiAbandonRun,
  createAutonomousRun as apiCreateRun,
  ignoreAutonomousException as apiIgnoreException,
  resolveAutonomousException as apiResolveException,
  fetchActiveAutonomousRun,
  fetchAutonomousExceptions,
  fetchAutonomousRun,
  fetchLatestAutonomousRun,
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
        await loadExceptions(activeRun.id)
        if (activeRun.status === 'running') {
          startPolling(activeRun.id)
        }
      }
    }
    catch (err: any) {
      error.value = err.message || '加载活跃自动驾驶任务失败'
    }
    finally {
      loading.value = false
    }
  }

  async function loadLatestRun() {
    loading.value = true
    error.value = null
    try {
      const latestRun = await fetchLatestAutonomousRun(projectId)
      if (latestRun) {
        // Auto-cleanup stale idle runs (idle >5 min = never started)
        if (latestRun.status === 'idle') {
          const created = latestRun.createdAt ? new Date(latestRun.createdAt).getTime() : 0
          if (Date.now() - created > 5 * 60 * 1000) {
            await apiAbandonRun(projectId, latestRun.id)
            currentRun.value = null
            return
          }
        }
        currentRun.value = latestRun
        await loadExceptions(latestRun.id)
        if (latestRun.status === 'running') {
          startPolling(latestRun.id)
        }
      }
    }
    catch (err: any) {
      error.value = err.message || '加载自动驾驶任务失败'
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
    }
    catch (err: any) {
      if (err.message?.includes('not found')) {
        currentRun.value = null
      }
      else {
        error.value = err.message || '加载自动驾驶任务失败'
      }
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
      error.value = err.message || '停止本轮失败'
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

  async function abandon(runId: string) {
    try {
      await apiAbandonRun(projectId, runId)
      await loadRun(runId)
    }
    catch (err: any) {
      error.value = err.message || '放弃任务失败'
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
        await loadExceptions(runId)

        const terminalStatuses = ['completed', 'failed', 'abandoned', 'paused']
        if (currentRun.value && terminalStatuses.includes(currentRun.value.status)) {
          stopPolling()
        }
      }
      catch (e: any) {
        if (e.message?.includes('not found')) {
          currentRun.value = null
          stopPolling()
        }
        else {
          error.value = e.message || '轮询更新失败'
        }
      }
    }, 3000)
  }

  function stopPolling() {
    if (timer.value) {
      clearInterval(timer.value)
      timer.value = null
    }
  }

  const totalJobs = computed(() => currentRun.value?.jobs?.length ?? 0)
  const completedJobs = computed(() => currentRun.value?.jobs?.filter((j: any) => j.status === 'completed').length ?? 0)
  const failedJobs = computed(() => currentRun.value?.jobs?.filter((j: any) => j.status === 'failed').length ?? 0)
  const chapterProgress = computed(() => totalJobs.value === 0 ? 0 : Math.round((completedJobs.value / totalJobs.value) * 100))
  const runningJob = computed(() => currentRun.value?.jobs?.find((j: any) => j.status === 'running') ?? null)

  const elapsedMs = computed(() => {
    if (!currentRun.value?.startedAt)
      return 0
    const start = new Date(currentRun.value.startedAt).getTime()
    const end = currentRun.value.finishedAt
      ? new Date(currentRun.value.finishedAt).getTime()
      : (currentRun.value.status === 'paused' ? new Date(currentRun.value.updatedAt).getTime() : Date.now())
    return Math.max(0, end - start)
  })

  const averageMsPerChapter = computed(() => {
    if (!currentRun.value?.startedAt || completedJobs.value === 0)
      return 0
    return elapsedMs.value / completedJobs.value
  })

  const estimatedRemainingMs = computed(() => {
    if (averageMsPerChapter.value === 0)
      return 0
    const remaining = totalJobs.value - completedJobs.value - failedJobs.value
    return remaining <= 0 ? 0 : remaining * averageMsPerChapter.value
  })

  onUnmounted(stopPolling)

  return {
    currentRun,
    exceptions,
    loading,
    error,
    totalJobs,
    completedJobs,
    failedJobs,
    chapterProgress,
    elapsedMs,
    runningJob,
    averageMsPerChapter,
    estimatedRemainingMs,
    createRun,
    loadRun,
    loadActiveRun,
    loadLatestRun,
    loadExceptions,
    start,
    pause,
    resume,
    abandon,
    resolveException,
    ignoreException,
    stopPolling,
  }
}
