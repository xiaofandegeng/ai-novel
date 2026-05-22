import { onBeforeUnmount, watch } from 'vue'
import { useAutomationCockpitStore } from '../stores/automation-cockpit.store'

export function useCockpitPolling(projectId: string, intervalMs = 4000) {
  const store = useAutomationCockpitStore()
  let timerId: any = null

  function startPolling() {
    if (timerId)
      return
    timerId = setInterval(() => {
      // 只有在 run 处于运行或需要确认时才发起轮询，以避免冗余的后台请求
      const runStatus = store.payload?.run?.status
      if (runStatus === 'running' || runStatus === 'waiting_review') {
        store.fetchCockpit(projectId)
      }
      else {
        // 如果任务不再活跃，自动停止轮询
        stopPolling()
      }
    }, intervalMs)
  }

  function stopPolling() {
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }
  }

  // 监听任务状态自动启停轮询
  watch(
    () => store.payload?.run?.status,
    (status) => {
      if (status === 'running' || status === 'waiting_review') {
        startPolling()
      }
      else {
        stopPolling()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stopPolling()
  })

  return {
    startPolling,
    stopPolling,
  }
}
