<script setup lang="ts">
import type { WritingJob, WritingJobStep } from '@ai-novel/shared'
import {
  NButton,
  NTag,
} from '@ai-novel/ui'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clapperboard,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Trash2,
  XCircle,
} from 'lucide-vue-next'
import { computed } from 'vue'
import {
  CONFIRM_STEP_TYPES,
  JOB_STATUS_LABEL,
  JOB_STATUS_VARIANT,
  MODE_LABEL,
  STEP_LABEL,
  STEP_STATUS_CONFIG,
} from '../composables/useWritingJobController'

const props = defineProps<{
  job: WritingJob
  steps: WritingJobStep[]
  actionLoading: string | null
  currentReviewStepId: string | null
}>()

const emit = defineEmits<{
  start: []
  pause: []
  delete: []
  approve: [stepId: string]
  reject: [stepId: string]
  retry: [stepId: string]
}>()

const sceneDraftLabel = computed(() => {
  if (props.job.mode !== 'scene_draft' || !props.job.sceneId)
    return null
  const planStep = props.steps.find(s => s.stepType === 'generate_plan')
  if (planStep?.output) {
    try {
      const plan = JSON.parse(planStep.output)
      if (plan.title)
        return plan.title
    }
    catch {}
  }
  return `场景 ${props.job.sceneId.slice(0, 8)}...`
})

function getReviewOutput(step: WritingJobStep, steps: WritingJobStep[]): any | null {
  if (!CONFIRM_STEP_TYPES.has(step.stepType))
    return null
  const idx = steps.findIndex(s => s.id === step.id)
  if (idx <= 0)
    return null
  const prevStep = steps[idx - 1]
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
</script>

<template>
  <div class="space-y-4">
    <!-- Job header -->
    <div class="border border-border-light rounded-lg bg-bg-surface p-6">
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Bot :size="20" class="text-primary" />
          <div>
            <h3 class="text-sm text-text-primary font-bold">
              写作任务
            </h3>
            <span class="text-xs text-text-muted">{{ MODE_LABEL[job.mode] }}</span>
            <span v-if="sceneDraftLabel" class="flex items-center gap-1 text-xs text-primary">
              <Clapperboard :size="10" /> {{ sceneDraftLabel }}
            </span>
          </div>
        </div>
        <NTag :variant="JOB_STATUS_VARIANT[job.status]">
          {{ JOB_STATUS_LABEL[job.status] }}
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
          @click="emit('start')"
        >
          <Play :size="14" class="mr-1" /> 启动
        </NButton>
        <NButton
          v-if="job.status === 'paused'"
          variant="primary"
          :loading="actionLoading === 'start'"
          @click="emit('start')"
        >
          <Play :size="14" class="mr-1" /> 继续
        </NButton>
        <NButton
          v-if="job.status === 'running'"
          :loading="actionLoading === 'pause'"
          @click="emit('pause')"
        >
          <Pause :size="14" class="mr-1" /> 暂停
        </NButton>
        <NButton
          v-if="job.status === 'failed'"
          variant="primary"
          :loading="actionLoading === 'start'"
          @click="emit('start')"
        >
          <Play :size="14" class="mr-1" /> 重新启动
        </NButton>
        <NButton variant="ghost" class="text-text-muted hover:text-red-500" @click="emit('delete')">
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
            'bg-primary-soft/30': step.id === currentReviewStepId,
            'bg-red-50': step.status === 'failed',
          }"
        >
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

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm text-text-primary font-medium">
                {{ STEP_LABEL[step.stepType] || step.stepType }}
              </span>
              <NTag v-if="step.status === 'running'" variant="info" size="sm">
                {{ STEP_STATUS_CONFIG[step.status].label }}
              </NTag>
            </div>

            <div v-if="step.error" class="mt-1 text-xs text-red-600">
              {{ step.error }}
            </div>

            <!-- Confirm step review panel -->
            <div
              v-if="step.id === currentReviewStepId"
              class="mt-3"
            >
              <div class="bg-bg-base border border-border-light rounded-md p-3">
                <div class="mb-2 text-xs text-text-muted font-semibold">
                  AI 生成内容预览
                </div>

                <template v-if="step.stepType === 'confirm_plan'">
                  <div v-if="getReviewOutput(step, steps)" class="text-xs text-text-secondary space-y-2">
                    <div v-if="getReviewOutput(step, steps).title" class="text-text-primary font-medium">
                      {{ getReviewOutput(step, steps).title }}
                    </div>
                    <div v-if="getReviewOutput(step, steps).goals">
                      <span class="text-text-muted">目标：</span>{{ getReviewOutput(step, steps).goals }}
                    </div>
                    <div v-if="getReviewOutput(step, steps).conflicts">
                      <span class="text-text-muted">冲突：</span>{{ getReviewOutput(step, steps).conflicts }}
                    </div>
                    <div v-if="getReviewOutput(step, steps).outline" class="whitespace-pre-wrap">
                      <span class="text-text-muted">大纲：</span>{{ getReviewOutput(step, steps).outline }}
                    </div>
                  </div>
                  <div v-else class="text-xs text-text-muted">
                    暂无预览内容
                  </div>
                </template>

                <template v-else-if="step.stepType === 'confirm_apply'">
                  <div v-if="getReviewOutput(step, steps)" class="text-xs text-text-secondary space-y-2">
                    <div v-if="getReviewOutput(step, steps).title" class="text-text-primary font-medium">
                      {{ getReviewOutput(step, steps).title }}
                    </div>
                    <div v-if="getReviewOutput(step, steps).wordCount" class="text-text-muted">
                      字数：{{ getReviewOutput(step, steps).wordCount }}
                    </div>
                    <div v-if="getReviewOutput(step, steps).draft" class="max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">
                      {{ getReviewOutput(step, steps).draft }}
                    </div>
                  </div>
                  <div v-else class="text-xs text-text-muted">
                    暂无预览内容
                  </div>
                </template>

                <template v-else-if="step.stepType === 'confirm_suggestions'">
                  <div v-if="getReviewOutput(step, steps)" class="text-xs text-text-secondary">
                    <div v-if="getReviewOutput(step, steps).memory?.summary" class="mb-2">
                      <span class="text-text-muted">章节摘要：</span>{{ getReviewOutput(step, steps).memory.summary }}
                    </div>
                    <div v-if="getReviewOutput(step, steps).warnings?.length" class="text-amber-600">
                      {{ getReviewOutput(step, steps).warnings.join('；') }}
                    </div>
                    <div v-else class="text-text-muted">
                      章后管线已执行，建议已生成。
                    </div>
                  </div>
                  <div v-else class="text-xs text-text-muted">
                    暂无预览内容
                  </div>
                </template>

                <div class="mt-3 flex gap-2">
                  <NButton
                    variant="primary"
                    size="sm"
                    :loading="actionLoading === `approve-${step.id}`"
                    @click="emit('approve', step.id)"
                  >
                    <CheckCircle2 :size="12" class="mr-1" /> 确认继续
                  </NButton>
                  <NButton
                    size="sm"
                    :loading="actionLoading === `reject-${step.id}`"
                    @click="emit('reject', step.id)"
                  >
                    <XCircle :size="12" class="mr-1" /> 驳回
                  </NButton>
                </div>
              </div>
            </div>

            <!-- Consistency check output -->
            <div
              v-if="step.status === 'completed' && !CONFIRM_STEP_TYPES.has(step.stepType) && step.output && (step.stepType === 'consistency_check' || step.stepType === 'update_health')"
              class="mt-2"
            >
              <details class="text-xs text-text-muted">
                <summary class="cursor-pointer hover:text-text-secondary">
                  {{ step.stepType === 'update_health' ? '查看健康摘要' : '查看检查结果' }}
                </summary>
                <div class="bg-bg-base mt-1 border border-border-light rounded p-2">
                  <template v-if="getStepOutput(step) && step.stepType === 'consistency_check'">
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
                  <template v-else-if="getStepOutput(step) && step.stepType === 'update_health'">
                    <div class="grid grid-cols-2 gap-2 text-text-secondary">
                      <div>章节进度：{{ getStepOutput(step).completedChapters }} / {{ getStepOutput(step).totalChapters }}</div>
                      <div>开放伏笔：{{ getStepOutput(step).openForeshadowingCount }}</div>
                      <div>无正文场景：{{ getStepOutput(step).scenesWithoutContent }}</div>
                      <div>无冲突场景：{{ getStepOutput(step).scenesWithoutConflict }}</div>
                    </div>
                    <div v-if="getStepOutput(step).topRisks?.length" class="mt-2 space-y-1">
                      <div
                        v-for="risk in getStepOutput(step).topRisks"
                        :key="`${risk.type}-${risk.title}`"
                        class="rounded bg-bg-subtle px-2 py-1 text-text-secondary"
                      >
                        <span class="font-medium">{{ risk.title }}</span>
                        <span class="ml-1 text-text-muted">({{ risk.severity === 'high' ? '高风险' : risk.severity === 'medium' ? '中风险' : '低风险' }})</span>
                      </div>
                    </div>
                  </template>
                </div>
              </details>
            </div>

            <!-- Retry for failed steps -->
            <div v-if="step.status === 'failed'" class="mt-2">
              <NButton
                size="sm"
                :loading="actionLoading === `retry-${step.id}`"
                @click="emit('retry', step.id)"
              >
                <RefreshCw :size="12" class="mr-1" /> 重试
              </NButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
