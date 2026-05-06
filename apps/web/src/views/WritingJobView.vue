<script setup lang="ts">
import type { WritingJobMode, WritingJobStep, WritingJobStepStatus, WritingJobStepType } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Trash2,
  XCircle,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useProjectStore, useWritingJobStore } from '../stores/projects'

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const writingJobStore = useWritingJobStore()

const loading = ref(true)
const creating = ref(false)
const actionLoading = ref<string | null>(null)

const job = computed(() => writingJobStore.job)
const steps = computed(() => writingJobStore.steps)

const statusLabel: Record<string, string> = {
  idle: '就绪',
  running: '运行中',
  waiting_review: '等待审查',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}
const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  idle: 'default',
  running: 'info',
  waiting_review: 'warning',
  paused: 'default',
  completed: 'success',
  failed: 'error',
}

const modeLabel: Record<WritingJobMode, string> = {
  outline_only: '仅大纲',
  draft_only: '仅正文',
  outline_then_draft: '大纲+正文',
}

const stepLabel: Record<WritingJobStepType, string> = {
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

const stepStatusConfig: Record<WritingJobStepStatus, { label: string, variant: 'default' | 'info' | 'success' | 'error' | 'warning', icon: any }> = {
  pending: { label: '等待中', variant: 'default', icon: Clock },
  running: { label: '运行中', variant: 'info', icon: Loader2 },
  completed: { label: '已完成', variant: 'success', icon: CheckCircle2 },
  failed: { label: '失败', variant: 'error', icon: XCircle },
  skipped: { label: '已跳过', variant: 'default', icon: SkipForward },
}

const confirmStepTypes: Set<string> = new Set(['confirm_plan', 'confirm_apply', 'confirm_suggestions'])

const form = ref<WritingJobMode>('outline_then_draft')

// Determine what content to show for a confirm step (the preceding step's output)
function getReviewOutput(step: WritingJobStep): any | null {
  if (!confirmStepTypes.has(step.stepType))
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
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
  >
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full overflow-y-auto p-6">
      <div class="mb-6">
        <h1 class="text-lg text-text-primary font-bold">
          半自动写作
        </h1>
        <p class="text-sm text-text-muted">
          系统生成、作者确认的可控长篇写作流程
        </p>
      </div>

      <NLoadingState v-if="loading" />
      <div v-else class="mx-auto max-w-2xl">
        <!-- No job: create form -->
        <div v-if="!job" class="border border-border-light rounded-lg bg-bg-surface p-6 space-y-4">
          <div class="mb-2 flex items-center gap-3">
            <Bot :size="20" class="text-primary" />
            <h3 class="text-sm text-text-primary font-bold">
              创建写作任务
            </h3>
          </div>

          <div>
            <label class="mb-2 block text-xs text-text-muted">写作模式</label>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="(label, mode) in modeLabel"
                :key="mode"
                class="border rounded-lg p-3 text-center text-sm transition-colors"
                :class="form === mode ? 'border-primary bg-primary-soft text-primary' : 'border-border-light text-text-secondary hover:bg-bg-subtle'"
                @click="form = mode as WritingJobMode"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <div class="flex justify-end">
            <NButton :loading="creating" @click="handleCreate">
              创建任务
            </NButton>
          </div>
        </div>

        <!-- Job exists: status, steps & controls -->
        <div v-else class="space-y-4">
          <!-- Job header -->
          <div class="border border-border-light rounded-lg bg-bg-surface p-6">
            <div class="mb-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Bot :size="20" class="text-primary" />
                <div>
                  <h3 class="text-sm text-text-primary font-bold">
                    写作任务
                  </h3>
                  <span class="text-xs text-text-muted">{{ modeLabel[job.mode] }}</span>
                </div>
              </div>
              <NTag :variant="statusVariant[job.status]">
                {{ statusLabel[job.status] }}
              </NTag>
            </div>

            <div v-if="job.lastError" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle :size="14" class="mr-1 inline-block" />
              {{ job.lastError }}
            </div>

            <div class="flex gap-3">
              <NButton
                v-if="job.status === 'idle'"
                variant="primary"
                :loading="actionLoading === 'start'"
                @click="handleStart"
              >
                <Play :size="14" class="mr-1" /> 启动
              </NButton>
              <NButton
                v-if="job.status === 'paused'"
                variant="primary"
                :loading="actionLoading === 'start'"
                @click="handleStart"
              >
                <Play :size="14" class="mr-1" /> 继续
              </NButton>
              <NButton
                v-if="job.status === 'running'"
                :loading="actionLoading === 'pause'"
                @click="handlePause"
              >
                <Pause :size="14" class="mr-1" /> 暂停
              </NButton>
              <NButton
                v-if="job.status === 'failed'"
                variant="primary"
                :loading="actionLoading === 'start'"
                @click="handleStart"
              >
                <Play :size="14" class="mr-1" /> 重新启动
              </NButton>
              <NButton variant="ghost" class="text-text-muted hover:text-red-500" @click="handleDelete">
                <Trash2 :size="14" class="mr-1" /> 删除任务
              </NButton>
            </div>
          </div>

          <!-- Step list -->
          <div v-if="steps.length > 0" class="border border-border-light rounded-lg bg-bg-surface p-4">
            <h4 class="mb-3 text-xs text-text-muted font-semibold">
              写作流程步骤
            </h4>
            <div class="space-y-2">
              <div
                v-for="(step, idx) in steps"
                :key="step.id"
                class="flex items-start gap-3 rounded-md p-3 transition-colors"
                :class="{
                  'bg-bg-subtle': step.status === 'running',
                  'bg-primary-soft/30': confirmStepTypes.has(step.stepType) && step.status === 'completed' && job.status === 'waiting_review',
                  'bg-red-50': step.status === 'failed',
                }"
              >
                <!-- Step number and status indicator -->
                <div class="flex flex-col items-center gap-1">
                  <span
                    class="h-6 w-6 flex items-center justify-center rounded-full text-[10px] font-bold"
                    :class="{
                      'bg-primary-soft text-primary': step.status === 'pending' || step.status === 'running',
                      'bg-green-100 text-green-700': step.status === 'completed',
                      'bg-red-100 text-red-700': step.status === 'failed',
                      'bg-gray-100 text-gray-500': step.status === 'skipped',
                    }"
                  >
                    <Loader2 v-if="step.status === 'running'" :size="12" class="animate-spin" />
                    <CheckCircle2 v-else-if="step.status === 'completed'" :size="12" />
                    <XCircle v-else-if="step.status === 'failed'" :size="12" />
                    <SkipForward v-else-if="step.status === 'skipped'" :size="12" />
                    <template v-else>{{ idx + 1 }}</template>
                  </span>
                  <div v-if="idx < steps.length - 1" class="h-4 w-px bg-border-light" />
                </div>

                <!-- Step content -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-text-primary font-medium">
                      {{ stepLabel[step.stepType] || step.stepType }}
                    </span>
                    <NTag v-if="step.status === 'running'" variant="info" size="sm">
                      {{ stepStatusConfig[step.status].label }}
                    </NTag>
                  </div>

                  <!-- Error message for failed steps -->
                  <div v-if="step.error" class="mt-1 text-xs text-red-600">
                    {{ step.error }}
                  </div>

                  <!-- Show review content for confirm steps when job is waiting_review -->
                  <div
                    v-if="confirmStepTypes.has(step.stepType) && step.status === 'completed' && job.status === 'waiting_review'"
                    class="mt-3"
                  >
                    <!-- Show the preceding step's output for review -->
                    <div class="bg-bg-base border border-border-light rounded-md p-3">
                      <div class="mb-2 text-xs text-text-muted font-semibold">
                        AI 生成内容预览
                      </div>

                      <!-- For confirm_plan: show the outline -->
                      <template v-if="step.stepType === 'confirm_plan'">
                        <div v-if="getReviewOutput(step)" class="text-xs text-text-secondary space-y-2">
                          <div v-if="getReviewOutput(step).title" class="text-text-primary font-medium">
                            {{ getReviewOutput(step).title }}
                          </div>
                          <div v-if="getReviewOutput(step).goals">
                            <span class="text-text-muted">目标：</span>{{ getReviewOutput(step).goals }}
                          </div>
                          <div v-if="getReviewOutput(step).conflicts">
                            <span class="text-text-muted">冲突：</span>{{ getReviewOutput(step).conflicts }}
                          </div>
                          <div v-if="getReviewOutput(step).outline" class="whitespace-pre-wrap">
                            <span class="text-text-muted">大纲：</span>{{ getReviewOutput(step).outline }}
                          </div>
                        </div>
                        <div v-else class="text-xs text-text-muted">
                          暂无预览内容
                        </div>
                      </template>

                      <!-- For confirm_apply: show the draft -->
                      <template v-else-if="step.stepType === 'confirm_apply'">
                        <div v-if="getReviewOutput(step)" class="text-xs text-text-secondary space-y-2">
                          <div v-if="getReviewOutput(step).title" class="text-text-primary font-medium">
                            {{ getReviewOutput(step).title }}
                          </div>
                          <div v-if="getReviewOutput(step).wordCount" class="text-text-muted">
                            字数：{{ getReviewOutput(step).wordCount }}
                          </div>
                          <div v-if="getReviewOutput(step).draft" class="max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">
                            {{ getReviewOutput(step).draft }}
                          </div>
                        </div>
                        <div v-else class="text-xs text-text-muted">
                          暂无预览内容
                        </div>
                      </template>

                      <!-- For confirm_suggestions: show postprocess results -->
                      <template v-else-if="step.stepType === 'confirm_suggestions'">
                        <div v-if="getReviewOutput(step)" class="text-xs text-text-secondary">
                          <div v-if="getReviewOutput(step).memory?.summary" class="mb-2">
                            <span class="text-text-muted">章节摘要：</span>{{ getReviewOutput(step).memory.summary }}
                          </div>
                          <div v-if="getReviewOutput(step).warnings?.length" class="text-amber-600">
                            {{ getReviewOutput(step).warnings.join('；') }}
                          </div>
                          <div v-else class="text-text-muted">
                            章后管线已执行，建议已生成。
                          </div>
                        </div>
                        <div v-else class="text-xs text-text-muted">
                          暂无预览内容
                        </div>
                      </template>

                      <!-- Approve/Reject buttons -->
                      <div class="mt-3 flex gap-2">
                        <NButton
                          variant="primary"
                          size="sm"
                          :loading="actionLoading === `approve-${step.id}`"
                          @click="handleApprove(step.id)"
                        >
                          <CheckCircle2 :size="12" class="mr-1" /> 确认继续
                        </NButton>
                        <NButton
                          size="sm"
                          :loading="actionLoading === `reject-${step.id}`"
                          @click="handleReject(step.id)"
                        >
                          <XCircle :size="12" class="mr-1" /> 驳回
                        </NButton>
                      </div>
                    </div>
                  </div>

                  <!-- Show output for completed non-confirm steps with meaningful output -->
                  <div
                    v-if="step.status === 'completed' && !confirmStepTypes.has(step.stepType) && step.output && (step.stepType === 'consistency_check')"
                    class="mt-2"
                  >
                    <details class="text-xs text-text-muted">
                      <summary class="cursor-pointer hover:text-text-secondary">
                        查看检查结果
                      </summary>
                      <div class="bg-bg-base mt-1 border border-border-light rounded p-2">
                        <template v-if="getStepOutput(step)">
                          <div class="mb-1">
                            <span class="font-medium">状态：</span>
                            <span
                              :class="{
                                'text-green-600': getStepOutput(step).overallStatus === 'pass',
                                'text-amber-600': getStepOutput(step).overallStatus === 'warning',
                                'text-red-600': getStepOutput(step).overallStatus === 'blocked',
                              }"
                            >
                              {{ getStepOutput(step).overallStatus === 'pass' ? '通过' : getStepOutput(step).overallStatus === 'warning' ? '警告' : '阻止' }}
                            </span>
                            <span class="ml-2">得分：{{ getStepOutput(step).score }}</span>
                          </div>
                          <div v-if="getStepOutput(step).risks?.length" class="text-red-600">
                            {{ getStepOutput(step).risks.map((r: any) => r.message).join('；') }}
                          </div>
                        </template>
                      </div>
                    </details>
                  </div>

                  <!-- Retry button for failed steps -->
                  <div v-if="step.status === 'failed'" class="mt-2">
                    <NButton
                      size="sm"
                      :loading="actionLoading === `retry-${step.id}`"
                      @click="handleRetry(step.id)"
                    >
                      <RefreshCw :size="12" class="mr-1" /> 重试
                    </NButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
