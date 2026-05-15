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
    case 'running': return 'text-primary'
    default: return 'text-text-muted'
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

    <div class="relative pl-4 before:absolute before:bottom-2 before:left-1 before:top-2 before:w-0.5 space-y-6 before:bg-border-light before:content-['']">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="relative"
      >
        <!-- Node Dot -->
        <div
          class="absolute top-1 z-10 h-3 w-3 border-2 border-bg-surface rounded-full -left-[1.15rem]"
          :class="job.status === 'running' ? 'bg-primary animate-pulse' : job.status === 'completed' ? 'bg-green-500' : 'bg-border-light'"
        />

        <div class="border border-border-light rounded-md bg-bg-surface p-3 shadow-sm transition-colors hover:border-primary">
          <div class="mb-1 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <component :is="getStatusIcon(job.status)" :size="14" :class="getStatusColor(job.status)" />
              <span class="text-sm font-medium">章节: {{ job.chapterId?.slice(0, 8) }}</span>
            </div>
            <span class="text-[10px] text-text-muted">{{ new Date(job.createdAt).toLocaleTimeString() }}</span>
          </div>

          <div class="mb-2 text-xs text-text-secondary">
            任务 ID: {{ job.writingJobId.slice(0, 8) }}...
          </div>

          <div class="flex items-center justify-between">
            <div class="flex gap-1">
              <NTag size="sm" :variant="job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : 'default'">
                {{ job.status.toUpperCase() }}
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
