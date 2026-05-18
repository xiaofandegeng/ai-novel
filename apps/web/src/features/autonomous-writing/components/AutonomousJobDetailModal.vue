<script setup lang="ts">
import {
  NButton,
  NLoadingState,
  useToast,
} from '@ai-novel/ui'
import { AlertCircle, X } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { fetchJobSteps, fetchWritingJobById, retryStep, startWritingJob } from '@/api/writing-jobs'
import WritingJobStepTimeline from '@/features/writing-jobs/components/WritingJobStepTimeline.vue'

const props = defineProps<{
  projectId: string
  jobId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const toast = useToast()
const loading = ref(true)
const job = ref<any>(null)
const steps = ref<any[]>([])
const actionLoading = ref<string | null>(null)

async function loadData() {
  loading.value = true
  try {
    const [jobData, stepsData] = await Promise.all([
      fetchWritingJobById(props.projectId, props.jobId),
      fetchJobSteps(props.projectId, props.jobId),
    ])
    job.value = jobData
    steps.value = stepsData
  }
  catch (err) {
    console.error('Failed to load job details', err)
    toast.add('加载任务详情失败', 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadData)

async function handleRetry(stepId: string) {
  actionLoading.value = `retry-${stepId}`
  try {
    const res = await retryStep(props.projectId, props.jobId, stepId)
    job.value = res.job
    steps.value = res.steps
    toast.add('正在重试步骤', 'success')
  }
  catch (err: any) {
    toast.add(err.message || '操作失败', 'error')
  }
  finally {
    actionLoading.value = null
  }
}

async function handleStart() {
  actionLoading.value = 'start'
  try {
    job.value = await startWritingJob(props.projectId, props.jobId)
    steps.value = await fetchJobSteps(props.projectId, props.jobId)
    toast.add('任务已启动', 'success')
  }
  catch (err: any) {
    toast.add(err.message || '启动失败', 'error')
  }
  finally {
    actionLoading.value = null
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
    <div class="max-h-[90vh] max-w-3xl w-full flex flex-col overflow-hidden border border-border-light rounded-xl bg-bg-surface shadow-2xl">
      <div class="flex items-center justify-between border-b border-border-light p-4">
        <h3 class="text-lg font-bold">
          写作任务详情
        </h3>
        <NButton variant="ghost" size="sm" @click="emit('close')">
          <X :size="18" />
        </NButton>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        <NLoadingState v-if="loading" />
        <div v-else-if="job">
          <div v-if="job.status === 'isolated' || job.status === 'failed'" class="mb-6 border border-orange-100 rounded-lg bg-orange-50 p-4 text-orange-700">
            <div class="flex items-center gap-2 font-bold">
              <AlertCircle :size="16" />
              {{ job.status === 'isolated' ? '任务已隔离' : '任务已失败' }}
            </div>
            <div class="mt-1 text-sm opacity-90">
              {{ job.lastError || '未知原因' }}
            </div>
          </div>

          <WritingJobStepTimeline
            :job="job"
            :steps="steps"
            :action-loading="actionLoading"
            :current-review-step-id="steps.find(s => (s.reviewRequired || s.autoDecision === 'paused') && (s.status === 'running' || s.status === 'completed'))?.id"
            read-only
            @retry="handleRetry"
            @start="handleStart"
          />
        </div>
        <div v-else class="py-20 text-center text-text-muted">
          无法加载任务信息
        </div>
      </div>

      <div class="flex justify-end border-t border-border-light bg-bg-subtle p-4">
        <NButton @click="emit('close')">
          关闭
        </NButton>
      </div>
    </div>
  </div>
</template>
