<script setup lang="ts">
import type { TagVariant } from '@ai-novel/ui'
import { NButton, NPanel, NTag } from '@ai-novel/ui'
import {
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Square,
  Timer,
} from 'lucide-vue-next'

defineProps<{
  currentRun: any
  loading?: boolean
  totalJobs: number
  completedJobs: number
  failedJobs: number
  chapterProgress: number
  elapsedMs: number
  estimatedRemainingMs: number
  averageMsPerChapter: number
  runningJob: any | null
}>()

const emit = defineEmits<{
  (e: 'pause', runId: string): void
  (e: 'resume', runId: string): void
  (e: 'abandon', runId: string): void
  (e: 'newRun'): void
  (e: 'refresh'): void
}>()

function getStatusColor(status: string): TagVariant {
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
    case 'running': return '正在驾驶'
    case 'completed': return '驾驶完成'
    case 'failed': return '驾驶事故'
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
  <NPanel v-if="currentRun" class="autonomous-run-control-bar" border-primary>
    <!-- Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div class="bg-primary-subtle rounded-full p-2 text-primary">
          <Rocket :size="20" :class="{ 'animate-pulse': currentRun.status === 'running' }" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-bold">
              {{ ['completed', 'failed', 'abandoned'].includes(currentRun.status) ? '最近驾驶记录' : '自动驾驶中' }}
            </h3>
            <NTag size="sm" :variant="getStatusColor(currentRun.status) as any">
              {{ getStatusLabel(currentRun.status) }}
            </NTag>
          </div>
          <p class="text-xs text-text-muted">
            策略: {{ currentRun.strategy }} | 进度: {{ completedJobs }} / {{ totalJobs }} 章
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <NButton
          v-if="currentRun.status === 'running'"
          size="sm"
          :loading="loading"
          @click="emit('pause', currentRun.id)"
        >
          <Pause :size="16" class="mr-1" /> 暂停
        </NButton>
        <NButton
          v-if="currentRun.status === 'running' || currentRun.status === 'paused'"
          size="sm"
          :loading="loading"
          @click="emit('abandon', currentRun.id)"
        >
          <Square :size="16" class="mr-1" /> 放弃本轮
        </NButton>
        <NButton
          v-if="currentRun.status === 'paused'"
          variant="primary"
          size="sm"
          :loading="loading"
          @click="emit('resume', currentRun.id)"
        >
          <Play :size="16" class="mr-1" /> 继续推进
        </NButton>
        <NButton variant="ghost" size="sm" @click="emit('refresh')">
          <RefreshCw :size="16" />
        </NButton>

        <NButton
          v-if="['completed', 'failed', 'abandoned'].includes(currentRun.status)"
          variant="secondary"
          size="sm"
          @click="emit('newRun')"
        >
          开启新一轮
        </NButton>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="mt-4 space-y-2">
      <div class="h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div
          class="h-full bg-primary transition-all duration-500"
          :style="{ width: `${chapterProgress}%` }"
        />
      </div>
      <div class="flex justify-between text-[10px] text-text-muted">
        <span>已完成: {{ completedJobs }}</span>
        <span>失败: {{ failedJobs }}</span>
        <span>总计: {{ totalJobs }}</span>
      </div>
    </div>

    <!-- Time Stats -->
    <div class="grid grid-cols-3 mt-3 gap-3">
      <div class="rounded-md bg-bg-subtle p-2 text-center">
        <div class="mb-0.5 flex items-center justify-center gap-1 text-[10px] text-text-muted">
          <Clock :size="10" /> 已用时间
        </div>
        <div class="text-sm font-bold">
          {{ formatDuration(elapsedMs) }}
        </div>
      </div>
      <div class="rounded-md bg-bg-subtle p-2 text-center">
        <div class="mb-0.5 flex items-center justify-center gap-1 text-[10px] text-text-muted">
          <Timer :size="10" /> 预计剩余
        </div>
        <div class="text-sm font-bold">
          {{ estimatedRemainingMs > 0 ? formatDuration(estimatedRemainingMs) : '--' }}
        </div>
      </div>
      <div class="rounded-md bg-bg-subtle p-2 text-center">
        <div class="mb-0.5 flex items-center justify-center gap-1 text-[10px] text-text-muted">
          <Clock :size="10" /> 平均每章
        </div>
        <div class="text-sm font-bold">
          {{ averageMsPerChapter > 0 ? formatDuration(averageMsPerChapter) : '--' }}
        </div>
      </div>
    </div>

    <!-- Current Activity -->
    <div v-if="runningJob" class="mt-3 border border-primary/20 rounded-md bg-primary/5 p-3">
      <div class="mb-1 text-[10px] text-text-muted">
        正在处理
      </div>
      <div class="flex items-center gap-2">
        <Loader2 :size="14" class="animate-spin text-primary" />
        <span class="text-sm font-medium">
          第 {{ runningJob.orderIndex + 1 }} 章 · {{ runningJob.stepSummary?.currentStepLabel || '准备中...' }}
        </span>
      </div>
      <div v-if="runningJob.stepSummary && runningJob.stepSummary.totalSteps > 0" class="mt-2">
        <div class="h-1 w-full overflow-hidden rounded-full bg-bg-subtle">
          <div
            class="h-full bg-primary/60 transition-all duration-300"
            :style="{ width: `${(runningJob.stepSummary.completedSteps / runningJob.stepSummary.totalSteps) * 100}%` }"
          />
        </div>
        <div class="mt-1 text-[10px] text-text-muted">
          步骤 {{ runningJob.stepSummary.completedSteps }} / {{ runningJob.stepSummary.totalSteps }}
        </div>
      </div>
    </div>
  </NPanel>
</template>

<style lang="scss" scoped>
.autonomous-run-control-bar {
  background: linear-gradient(to bottom right, var(--bg-surface), var(--bg-subtle));
}
</style>
