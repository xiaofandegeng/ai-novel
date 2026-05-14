import type { CreateWritingJobInput, WritingJobMode, WritingJobStep, WritingJobStepStatus, WritingJobStepType } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import {
  CheckCircle2,
  Clock,
  Loader2,
  SkipForward,
  XCircle,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useProjectStore } from '@/stores/project.store'
import { useWritingJobStore } from '@/stores/writing-job.store'
import { getErrorMessage } from '@/utils/error-message'
import { T } from '@/utils/toast-message'

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
  scene_draft: '场景草稿',
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
  apply_suggestions: '应用建议',
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
  const formChapterId = ref<string | null>(null)
  const formSceneId = ref<string | null>(null)

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

  const currentReviewStepId = computed(() => {
    if (job.value?.status !== 'waiting_review')
      return null

    const completedConfirmSteps = steps.value.filter(step =>
      CONFIRM_STEP_TYPES.has(step.stepType) && step.status === 'completed',
    )

    return completedConfirmSteps.at(-1)?.id ?? null
  })

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        writingJobStore.fetchJob(projectId),
      ])
    }
    catch {
      toast.add(getErrorMessage('job_load'), 'error')
    }
    finally {
      loading.value = false
    }
  })

  async function handleCreate() {
    creating.value = true
    try {
      const data: CreateWritingJobInput = { mode: form.value }
      if (form.value === 'scene_draft') {
        if (!formChapterId.value || !formSceneId.value) {
          toast.add('场景草稿模式需要选择章节和场景', 'warning')
          return
        }
        data.currentChapterId = formChapterId.value
        data.sceneId = formSceneId.value
      }
      await writingJobStore.createJob(projectId, data)
      toast.add(T.job_created, 'success')
    }
    catch {
      toast.add(getErrorMessage('job_create'), 'error')
    }
    finally {
      creating.value = false
    }
  }

  async function handleStart() {
    actionLoading.value = 'start'
    try {
      await writingJobStore.startJob(projectId)
      toast.add(T.job_started, 'success')
    }
    catch (e: any) {
      toast.add(e.message || getErrorMessage('job_start'), 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handlePause() {
    actionLoading.value = 'pause'
    try {
      await writingJobStore.pauseJob(projectId)
      toast.add(T.job_paused, 'success')
    }
    catch (e: any) {
      toast.add(e.message || getErrorMessage('job_pause'), 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleDelete() {
    actionLoading.value = 'delete'
    try {
      await writingJobStore.deleteJob(projectId)
      toast.add(T.job_deleted, 'success')
    }
    catch (e: any) {
      toast.add(e.message || getErrorMessage('job_delete'), 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleApprove(stepId: string) {
    actionLoading.value = `approve-${stepId}`
    try {
      await writingJobStore.approveStep(projectId, stepId)
      toast.add(T.job_confirmed, 'success')
    }
    catch (e: any) {
      toast.add(e.message || getErrorMessage('job_confirm'), 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleReject(stepId: string) {
    actionLoading.value = `reject-${stepId}`
    try {
      await writingJobStore.rejectStep(projectId, stepId)
      toast.add(T.job_rejected, 'success')
    }
    catch (e: any) {
      toast.add(e.message || getErrorMessage('job_reject'), 'error')
    }
    finally {
      actionLoading.value = null
    }
  }

  async function handleRetry(stepId: string) {
    actionLoading.value = `retry-${stepId}`
    try {
      await writingJobStore.retryStep(projectId, stepId)
      toast.add(T.job_retrying, 'success')
    }
    catch (e: any) {
      toast.add(e.message || getErrorMessage('job_retry'), 'error')
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
    formChapterId,
    formSceneId,
    currentReviewStepId,
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
