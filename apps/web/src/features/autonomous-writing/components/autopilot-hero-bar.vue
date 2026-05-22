<script setup lang="ts">
import type { AutonomousRunJob, AutonomousWritingRun } from '@ai-novel/shared'
import type { TagVariant } from '@ai-novel/ui'
import { NButton, NTag } from '@ai-novel/ui'
import {
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Square,
} from 'lucide-vue-next'
import { ref } from 'vue'

defineProps<{
  currentRun: AutonomousWritingRun & { jobs: AutonomousRunJob[] }
  loading?: boolean
  totalJobs: number
  completedJobs: number
  failedJobs: number
  chapterProgress: number
  elapsedMs: number
  estimatedRemainingMs: number
  averageMsPerChapter: number
  runningJob: AutonomousRunJob | null
}>()

const emit = defineEmits<{
  (e: 'pause', runId: string): void
  (e: 'resume', runId: string): void
  (e: 'abandon', runId: string): void
  (e: 'newRun'): void
  (e: 'refresh'): void
}>()

const expanded = ref(false)

function getStatusVariant(status: string): TagVariant {
  switch (status) {
    case 'running': return 'primary'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'paused': return 'warning'
    case 'abandoned': return 'default'
    default: return 'default'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'running': return '驾驶中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'paused': return '已暂停'
    case 'abandoned': return '已放弃'
    default: return status
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0)
    return '--'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0)
    return `${hours}h ${minutes}m`
  if (minutes > 0)
    return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
</script>

<template>
  <div class="autopilot-hero-bar border-b border-border-light bg-bg-surface">
    <!-- Main row -->
    <div class="flex items-center gap-4 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <Rocket :size="16" :class="currentRun.status === 'running' ? 'text-primary animate-pulse' : 'text-text-muted'" />
        <NTag size="sm" :variant="getStatusVariant(currentRun.status) as any">
          {{ getStatusLabel(currentRun.status) }}
        </NTag>
        <span class="text-xs text-text-muted">
          {{ completedJobs }} / {{ totalJobs }} 章
        </span>
      </div>

      <!-- Progress bar -->
      <div class="flex-1">
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
          <div
            class="h-full bg-primary transition-all duration-500"
            :style="{ width: `${chapterProgress}%` }"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1.5">
        <NButton
          v-if="currentRun.status === 'running'"
          size="sm"
          :loading="loading"
          @click="emit('pause', currentRun.id)"
        >
          <Pause :size="14" class="mr-1" /> 暂停
        </NButton>
        <NButton
          v-if="currentRun.status === 'paused'"
          variant="primary"
          size="sm"
          :loading="loading"
          @click="emit('resume', currentRun.id)"
        >
          <Play :size="14" class="mr-1" /> 继续
        </NButton>
        <NButton
          v-if="['running', 'paused'].includes(currentRun.status)"
          size="sm"
          :loading="loading"
          @click="emit('abandon', currentRun.id)"
        >
          <Square :size="14" class="mr-1" /> 放弃
        </NButton>
        <NButton
          v-if="['completed', 'failed', 'abandoned'].includes(currentRun.status)"
          variant="secondary"
          size="sm"
          @click="emit('newRun')"
        >
          新一轮
        </NButton>
        <NButton variant="ghost" size="sm" @click="expanded = !expanded">
          <Clock :size="14" />
        </NButton>
        <NButton variant="ghost" size="sm" @click="emit('refresh')">
          <RefreshCw :size="14" />
        </NButton>
      </div>
    </div>

    <!-- Expanded details -->
    <div v-if="expanded" class="border-t border-border-light px-4 py-2">
      <div class="grid grid-cols-3 gap-3">
        <div class="text-center">
          <div class="text-[10px] text-text-muted">
            已用时间
          </div>
          <div class="text-xs font-bold">
            {{ formatDuration(elapsedMs) }}
          </div>
        </div>
        <div class="text-center">
          <div class="text-[10px] text-text-muted">
            预计剩余
          </div>
          <div class="text-xs font-bold">
            {{ estimatedRemainingMs > 0 ? formatDuration(estimatedRemainingMs) : '--' }}
          </div>
        </div>
        <div class="text-center">
          <div class="text-[10px] text-text-muted">
            平均每章
          </div>
          <div class="text-xs font-bold">
            {{ averageMsPerChapter > 0 ? formatDuration(averageMsPerChapter) : '--' }}
          </div>
        </div>
      </div>

      <!-- Current job -->
      <div v-if="runningJob" class="mt-2 flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2">
        <Loader2 :size="14" class="animate-spin text-primary" />
        <span class="text-xs font-medium">
          第 {{ runningJob.orderIndex + 1 }} 章 · {{ runningJob.stepSummary?.currentStepLabel || '准备中...' }}
        </span>
        <div v-if="runningJob.stepSummary && runningJob.stepSummary.totalSteps > 0" class="flex-1">
          <div class="h-1 w-full overflow-hidden rounded-full bg-bg-subtle">
            <div
              class="h-full bg-primary/60 transition-all duration-300"
              :style="{ width: `${(runningJob.stepSummary.completedSteps / runningJob.stepSummary.totalSteps) * 100}%` }"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
