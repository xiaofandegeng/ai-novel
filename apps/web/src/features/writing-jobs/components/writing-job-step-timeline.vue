<script setup lang="ts">
import type { WritingJob, WritingJobStep } from '@ai-novel/shared'
import {
  NButton,
  NTag,
} from '@ai-novel/ui'
import {
  AlertCircle,
  BookOpen,
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
import { computed, ref } from 'vue'
import { useChapterStore } from '../../../stores/chapter.store'
import {
  CHECKPOINT_STEP_TYPES,
  JOB_STATUS_LABEL,
  JOB_STATUS_VARIANT,
  MODE_LABEL,
  STEP_LABEL,
  STEP_STATUS_CONFIG,
} from '../composables/useWritingJobController'
import ChapterChangeSetReviewPanel from './chapter-change-set-review-panel.vue'

const props = defineProps<{
  job: WritingJob
  steps: WritingJobStep[]
  actionLoading: string | null
}>()

const emit = defineEmits<{
  start: []
  pause: []
  delete: []
  retry: [stepId: string]
}>()

const expandedReportStepId = ref<string | null>(null)

const chapterStore = useChapterStore()

const targetChapter = computed(() => {
  if (!props.job.currentChapterId)
    return null
  return chapterStore.chapters.find(ch => ch.id === props.job.currentChapterId)
})

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

const missingTargetChapter = computed(() =>
  props.job.mode !== 'outline_only' && !props.job.currentChapterId,
)

function getReviewOutput(step: WritingJobStep, steps: WritingJobStep[]): any | null {
  if (!CHECKPOINT_STEP_TYPES.has(step.stepType))
    return null

  // For consistency_check, the output is in the step itself
  if (step.stepType === 'consistency_check') {
    return getStepOutput(step)
  }

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
            <div v-if="targetChapter" class="mt-1 flex items-center gap-1 text-xs text-text-secondary">
              <BookOpen :size="10" />
              第 {{ targetChapter.chapterNumber }} 章: {{ targetChapter.title }}
            </div>
            <span v-if="sceneDraftLabel" class="mt-1 flex items-center gap-1 text-xs text-primary">
              <Clapperboard :size="10" /> {{ sceneDraftLabel }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <NTag :variant="JOB_STATUS_VARIANT[job.status]">
            {{ JOB_STATUS_LABEL[job.status] }}
          </NTag>
        </div>
      </div>

      <div v-if="job.lastError" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
        <AlertCircle :size="14" class="mr-1 inline-block" />
        {{ job.lastError }}
      </div>

      <div v-if="missingTargetChapter" class="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
        <AlertCircle :size="14" class="mr-1 inline-block" />
        这个任务没有绑定正文写入章节，因此不会自动写入正文。请删除该旧任务，重新创建时选择“正文写入章节”。
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
          <Play :size="14" class="mr-1" /> 重新推进
        </NButton>
        <NButton
          v-if="job.status === 'running'"
          :loading="actionLoading === 'pause'"
          @click="emit('pause')"
        >
          <Pause :size="14" class="mr-1" /> 停止本轮
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
            'bg-primary-soft/30': step.id === expandedReportStepId,
            'bg-red-50': step.status === 'failed',
          }"
        >
          <div class="flex flex-col items-center gap-1">
            <span
              class="h-6 w-6 flex items-center justify-center rounded-full text-[10px] font-bold"
              :class="{
                'bg-primary-soft text-primary': step.status === 'pending' || (step.status === 'running' && !['paused', 'isolated', 'repair'].includes(step.autoDecision || '')),
                'bg-amber-100 text-amber-700': step.autoDecision === 'paused',
                'bg-orange-100 text-orange-700': step.autoDecision === 'isolated',
                'bg-blue-100 text-blue-700': step.autoDecision === 'repair' || step.autoDecision === 'medium_risk_repair',
                'bg-green-100 text-green-700': step.status === 'completed',
                'bg-red-100 text-red-700': step.status === 'failed',
                'bg-gray-100 text-gray-500': step.status === 'skipped',
              }"
            >
              <Pause v-if="step.autoDecision === 'paused'" :size="12" />
              <AlertCircle v-else-if="step.autoDecision === 'isolated'" :size="12" />
              <RefreshCw v-else-if="step.autoDecision === 'repair' || step.autoDecision === 'medium_risk_repair'" :size="12" :class="{ 'animate-spin': step.status === 'running' }" />
              <Loader2 v-else-if="step.status === 'running'" :size="12" class="animate-spin" />
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
              <NTag v-if="step.status === 'running' || step.autoDecision === 'paused'" :variant="step.autoDecision === 'paused' ? 'warning' : 'info'" size="sm">
                {{ step.autoDecision === 'paused' ? '自动隔离' : STEP_STATUS_CONFIG[step.status].label }}
              </NTag>
            </div>

            <div v-if="step.autoRiskLevel" class="mt-1">
              <NTag size="sm" :variant="step.autoRiskLevel === 'low' ? 'success' : step.autoRiskLevel === 'medium' ? 'warning' : 'error'">
                风险: {{ step.autoRiskLevel.toUpperCase() }}
              </NTag>
            </div>

            <div v-if="step.autoDecision === 'approved' || step.autoDecision === 'continue'" class="mt-1 flex items-center gap-1 text-[10px] text-green-600">
              <CheckCircle2 :size="10" /> 引擎自动通过：{{ step.autoDecisionReason }}
            </div>
            <div v-else-if="step.autoDecision === 'paused'" class="mt-1 flex items-center gap-1 text-[10px] text-amber-600">
              <Pause :size="10" /> 引擎自动隔离：{{ step.autoDecisionReason }}
            </div>
            <div v-else-if="step.autoDecision === 'repair' || step.autoDecision === 'medium_risk_repair'" class="mt-1 flex items-center gap-1 text-[10px] text-blue-600">
              <RefreshCw :size="10" /> 引擎自动修复：{{ step.autoDecisionReason }}
            </div>
            <div v-else-if="step.autoDecision === 'isolated'" class="mt-1 flex items-center gap-1 text-[10px] text-orange-600">
              <AlertCircle :size="10" /> 引擎自动隔离：{{ step.autoDecisionReason }}
            </div>
            <div v-else-if="step.autoDecision === 'skip'" class="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
              <SkipForward :size="10" /> 引擎自动跳过：{{ step.autoDecisionReason }}
            </div>
            <div v-else-if="step.autoDecision === 'stop_run'" class="mt-1 flex items-center gap-1 text-[10px] text-red-600">
              <XCircle :size="10" /> 引擎自动终止：{{ step.autoDecisionReason }}
            </div>

            <div v-if="step.error" class="mt-1 text-xs text-red-600">
              {{ step.error }}
            </div>

            <!-- Toggle decision report for checkpoint steps -->
            <NButton
              v-if="step.autoDecision && CHECKPOINT_STEP_TYPES.has(step.stepType) && expandedReportStepId !== step.id"
              size="sm"
              variant="ghost"
              class="mt-1"
              @click="expandedReportStepId = step.id"
            >
              <BookOpen :size="12" class="mr-1" /> 查看决策报告
            </NButton>

            <!-- Automated decision report panel -->
            <div
              v-if="expandedReportStepId === step.id && CHECKPOINT_STEP_TYPES.has(step.stepType)"
              class="mt-3"
            >
              <div class="bg-bg-base border border-border-light rounded-md p-3">
                <div class="mb-2 text-xs text-text-muted font-semibold">
                  AI 生成内容预览
                </div>

                <template v-if="step.stepType === 'validate_plan'">
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

                <template v-else-if="step.stepType === 'evaluate_change_set'">
                  <ChapterChangeSetReviewPanel
                    v-if="step.changeSetId"
                    :project-id="job.projectId"
                    :change-set-id="step.changeSetId"
                  />
                  <div v-else class="text-xs text-text-muted">
                    未关联变更集
                  </div>
                </template>

                <template v-else-if="step.stepType === 'classify_suggestions'">
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
                    size="sm"
                    @click="expandedReportStepId = expandedReportStepId === step.id ? null : step.id"
                  >
                    <BookOpen :size="12" class="mr-1" /> 关闭报告
                  </NButton>
                </div>
              </div>
            </div>

            <!-- Consistency check output -->
            <div
              v-if="step.status === 'completed' && !CHECKPOINT_STEP_TYPES.has(step.stepType) && step.output && (step.stepType === 'consistency_check' || step.stepType === 'update_health')"
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
