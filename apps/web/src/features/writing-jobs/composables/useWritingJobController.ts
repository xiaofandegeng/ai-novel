import type { WritingJobMode, WritingJobStep, WritingJobStepStatus, WritingJobStepType } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import {
  CheckCircle2,
  Clock,
  Loader2,
  SkipForward,
  XCircle,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useProjectStore, useWritingJobStore } from '@/stores/projects'

export const JOB_STATUS_LABEL: Record<string, string> = {
  idle: '就绪',
  running: '运行中',
  waiting_review: '等待审查',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}

export const JOB_STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  idle: 'default',
  running: 'info',
  waiting_review: 'warning',
  paused: 'default',
  completed: 'success',
  failed: 'error',
}

export const MODE_LABEL: Record<WritingJobMode, string> = {
  outline_only: '仅大纲',
  draft_only: '仅正文',
  outline_then_draft: '大纲+正文',
}

export const STEP_LABEL: Record<WritingJobStepType, string> = {
  prepare_context: '构建上下文',
  generate_plan: '生成大纲',
  confirm_plan: '审查大纲',
  generate_draft: '生成正文',
  consistency_check: '一致性检查',
  confirm_apply: '审查正文',
  apply_draft: '写入正文',
  save_version: '保存快照',
  postprocess: '章后管线',
  confirm_suggestions: '审查建议',
  update_health: '更新健康指标',
}

export const STEP_STATUS_CONFIG: Record<WritingJobStepStatus, { label: string, variant: 'default' | 'info' | 'success' | 'error' | 'warning', icon: any }> = {
  pending: { label: '等待中', variant: 'default', icon: Clock },
  running: { label: '运行中', variant: 'info', icon: Loader2 },
  completed: { label: '已完成', variant: 'success', icon: CheckCircle2 },
  failed: { label: '失败', variant: 'error', icon: XCircle },
  skipped: { label: '已跳过', variant: 'default', icon: SkipForward },
}

export const CONFIRM_STEP_TYPES = new Set(['confirm_plan', 'confirm_apply', 'confirm_suggestions'])

export function useWritingJobController(projectId: string) {
  const toast = useToast()
  const projectStore = useProjectStore()
  const writingJobStore = useWritingJobStore()

  const loading = ref(true)
  const creating = ref(false)
  const actionLoading = ref<string | null>(null)

  const job = computed(() => writingJobStore.job)
  const steps = computed(() => writingJobStore.steps)

  const form = ref<WritingJobMode>('outline_then_draft')

  function getReviewOutput(step: WritingJobStep): any | null {
    if (!CONFIRM_STEP_TYPES.has(step.stepType))
      return null
    const idx = steps.value.findIndex(s => s.id === step.id)
    if (idx <= 0)
      return null
    const prevStep = steps.value[idx - 1]
    if (!prevStep?.output)
      return null
    try {
      return JSON.parse(prevStep.output)
    }
    catch {
      return null
    }
  }

  function getStepOutput(step: WritingJobStep): any | null {
    if (!step.output)
      return null
    try {
      return JSON.parse(step.output)
    }
    catch {
      return null
    }
  }

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        writingJobStore.fetchJob(projectId),
      ])
    }
    catch {
      toast.add('加载写作任务失败', 'error')
    }
    finally {
      loading.value = false
    }
  })

  async function handleCreate() {
    creating.value = true
    try {
      await writingJobStore.createJob(projectId, { mode: form.value })
      toast.add('写作任务已创建', 'success')
    }
    catch {
      toast.add('创建失败', 'error')
    }
    finally {
      creating.value = false
    }
  }

  async function handleStart() {
    actionLoading.value = 'start'
    try {
      await writingJobStore.startJob(projectId)
      toast.add('任务已启动', 'success')
    }
    catch (e: any) {
      toast.add(e.message || '启动失败', 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handlePause() {
    actionLoading.value = 'pause'
    try {
      await writingJobStore.pauseJob(projectId)
      toast.add('任务已暂停', 'success')
    }
    catch (e: any) {
      toast.add(e.message || '暂停失败', 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleDelete() {
    actionLoading.value = 'delete'
    try {
      await writingJobStore.deleteJob(projectId)
      toast.add('任务已删除', 'success')
    }
    catch (e: any) {
      toast.add(e.message || '删除失败', 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleApprove(stepId: string) {
    actionLoading.value = `approve-${stepId}`
    try {
      await writingJobStore.approveStep(projectId, stepId)
      toast.add('已确认，继续执行', 'success')
    }
    catch (e: any) {
      toast.add(e.message || '确认失败', 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleReject(stepId: string) {
    actionLoading.value = `reject-${stepId}`
    try {
      await writingJobStore.rejectStep(projectId, stepId)
      toast.add('已驳回', 'success')
    }
    catch (e: any) {
      toast.add(e.message || '驳回失败', 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleRetry(stepId: string) {
    actionLoading.value = `retry-${stepId}`
    try {
      await writingJobStore.retryStep(projectId, stepId)
      toast.add('正在重试...', 'success')
    }
    catch (e: any) {
      toast.add(e.message || '重试失败', 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  return {
    loading,
    creating,
    actionLoading,
    job,
    steps,
    form,
    projectStore,
    getReviewOutput,
    getStepOutput,
    handleCreate,
    handleStart,
    handlePause,
    handleDelete,
    handleApprove,
    handleReject,
    handleRetry,
  }
}
