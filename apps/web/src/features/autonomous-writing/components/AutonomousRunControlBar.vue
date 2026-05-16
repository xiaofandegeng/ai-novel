<script setup lang="ts">
import type { TagVariant } from '@ai-novel/ui'
import { NButton, NPanel, NTag } from '@ai-novel/ui'
import {
  Pause,
  Play,
  RefreshCw,
  Rocket,
} from 'lucide-vue-next'

defineProps<{
  currentRun: any
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'pause', runId: string): void
  (e: 'resume', runId: string): void
  (e: 'newRun'): void
  (e: 'refresh'): void
}>()

function getStatusColor(status: string): TagVariant {
  switch (status) {
    case 'running': return 'primary'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'paused':
    case 'needs_attention': return 'warning'
    default: return 'default'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'running': return '正在驾驶'
    case 'completed': return '驾驶完成'
    case 'failed': return '驾驶事故'
    case 'paused': return '已暂停'
    case 'needs_attention': return '需要关注'
    default: return status
  }
}
</script>

<template>
  <NPanel v-if="currentRun" class="autonomous-run-control-bar" border-primary>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div class="bg-primary-subtle rounded-full p-2 text-primary">
          <Rocket :size="20" :class="{ 'animate-pulse': currentRun.status === 'running' }" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-bold">
              自动驾驶中
            </h3>
            <NTag size="sm" :variant="getStatusColor(currentRun.status) as any">
              {{ getStatusLabel(currentRun.status) }}
            </NTag>
          </div>
          <p class="text-xs text-text-muted">
            策略: {{ currentRun.strategy }} | 进度: {{ currentRun.completedChapterCount }} / {{ currentRun.targetChapterCount || '?' }}
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
          v-else-if="currentRun.status === 'paused'"
          variant="primary"
          size="sm"
          :loading="loading"
          @click="emit('resume', currentRun.id)"
        >
          <Play :size="16" class="mr-1" /> 继续推进
        </NButton>
        <span
          v-else-if="currentRun.status === 'needs_attention'"
          class="text-warning text-sm"
        >
          请先处理右侧待处理异常
        </span>

        <NButton variant="ghost" size="sm" @click="emit('refresh')">
          <RefreshCw :size="16" />
        </NButton>

        <NButton
          v-if="['completed', 'failed'].includes(currentRun.status)"
          variant="secondary"
          size="sm"
          @click="emit('newRun')"
        >
          开启新一轮
        </NButton>
      </div>
    </div>

    <div class="mt-4 space-y-2">
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div
          class="h-full bg-primary transition-all duration-500"
          :style="{ width: `${Math.min(100, (currentRun.completedChapterCount / (currentRun.targetChapterCount || 1)) * 100)}%` }"
        />
      </div>
      <div class="flex justify-between text-[10px] text-text-muted">
        <span>已完成: {{ currentRun.completedChapterCount }}</span>
        <span>失败: {{ currentRun.failedChapterCount || 0 }}</span>
        <span>目标: {{ currentRun.targetChapterCount || '?' }}</span>
      </div>
    </div>
  </NPanel>
</template>

<style lang="scss" scoped>
.autonomous-run-control-bar {
  background: linear-gradient(to bottom right, var(--bg-surface), var(--bg-subtle));
}
</style>
