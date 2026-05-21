<script setup lang="ts">
import { NTag } from '@ai-novel/ui'
import {
  CheckCircle2,
  FileText,
  History,
  PlayCircle,
  XCircle,
} from 'lucide-vue-next'

defineProps<{
  jobs: any[]
}>()

defineEmits<{
  (e: 'viewJob', jobId: string): void
}>()

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return CheckCircle2
    case 'failed': return XCircle
    case 'running': return PlayCircle
    default: return History
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'completed': return 'text-green-500'
    case 'failed': return 'text-red-500'
    case 'isolated': return 'text-orange-500'
    case 'running': return 'text-primary'
    default: return 'text-text-muted'
  }
}

function getStepBarColor(status: string) {
  switch (status) {
    case 'running': return 'bg-primary'
    case 'completed': return 'bg-green-500'
    case 'failed': return 'bg-red-400'
    case 'isolated': return 'bg-orange-400'
    default: return 'bg-border-light'
  }
}
</script>

<template>
  <div class="autonomous-run-timeline space-y-4">
    <div class="mb-4 flex items-center gap-2 px-1">
      <History :size="18" class="text-text-secondary" />
      <h3 class="text-sm font-bold">
        运行时间线
      </h3>
    </div>

    <div class="relative pl-4 before:absolute before:bottom-2 before:left-1 before:top-2 before:w-0.5 space-y-4 before:bg-border-light before:content-['']">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="relative"
      >
        <!-- Node Dot -->
        <div
          class="absolute top-1 z-10 h-3 w-3 border-2 border-bg-surface rounded-full -left-[1.15rem]"
          :class="job.status === 'running' ? 'bg-primary animate-pulse' : job.status === 'completed' ? 'bg-green-500' : job.status === 'isolated' ? 'bg-orange-500' : 'bg-border-light'"
        />

        <div
          class="border rounded-md p-3 shadow-sm transition-colors hover:border-primary"
          :class="job.status === 'running' ? 'border-primary/30 bg-primary/[0.02]' : 'border-border-light bg-bg-surface'"
        >
          <div class="mb-1 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <component :is="getStatusIcon(job.status)" :size="14" :class="getStatusColor(job.status)" />
              <span class="text-sm font-medium">第 {{ job.orderIndex + 1 }} 章</span>
            </div>
            <span class="text-[10px] text-text-muted">{{ new Date(job.createdAt).toLocaleTimeString() }}</span>
          </div>

          <!-- Step Progress -->
          <div v-if="job.stepSummary && job.stepSummary.totalSteps > 0" class="mt-2">
            <div class="mb-1 flex items-center justify-between text-[10px] text-text-muted">
              <span>
                步骤 {{ job.stepSummary.completedSteps }} / {{ job.stepSummary.totalSteps }}
                <template v-if="job.stepSummary.currentStepLabel">
                  · {{ job.stepSummary.currentStepLabel }}
                </template>
              </span>
              <span>{{ Math.round((job.stepSummary.completedSteps / job.stepSummary.totalSteps) * 100) }}%</span>
            </div>
            <div class="h-1 w-full overflow-hidden rounded-full bg-bg-subtle">
              <div
                class="h-full transition-all duration-300"
                :class="getStepBarColor(job.status)"
                :style="{ width: `${(job.stepSummary.completedSteps / job.stepSummary.totalSteps) * 100}%` }"
              />
            </div>
          </div>

          <!-- Status & Detail -->
          <div class="mt-2 flex items-center justify-between">
            <div class="flex gap-1">
              <NTag size="sm" :variant="job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : job.status === 'running' ? 'primary' : job.status === 'isolated' ? 'warning' : 'default'">
                {{ job.status === 'isolated' ? '已隔离' : job.status === 'pending' ? '等待中' : job.status.toUpperCase() }}
              </NTag>
            </div>

            <a
              href="#"
              class="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
              @click.prevent="$emit('viewJob', job.writingJobId)"
            >
              <FileText :size="10" /> 详情
            </a>
          </div>
        </div>
      </div>

      <div v-if="jobs.length === 0" class="py-10 text-center opacity-50">
        <History :size="32" class="mx-auto mb-2" />
        <p class="text-xs">
          暂无运行记录
        </p>
      </div>
    </div>
  </div>
</template>
