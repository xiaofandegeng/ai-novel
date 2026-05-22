<script setup lang="ts">
import type { AutonomousRunJob, Chapter } from '@ai-novel/shared'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  chapters: Chapter[]
  currentChapterId: string
  jobs: AutonomousRunJob[]
}>()

defineEmits<{
  (e: 'switch', id: string): void
}>()

const sortedChapters = computed(() =>
  [...props.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber),
)

const jobMap = computed(() => new Map(props.jobs.map(j => [j.chapterId, j])))

const completedCount = computed(() => props.jobs.filter(j => j.status === 'completed').length)

function getStepBarColor(status: string | undefined) {
  switch (status) {
    case 'running': return 'bg-primary'
    case 'completed': return 'bg-green-500'
    case 'failed': return 'bg-red-400'
    default: return 'bg-border-light'
  }
}

function getStatusIcon(status: string | undefined) {
  switch (status) {
    case 'completed': return CheckCircle2
    case 'failed': return XCircle
    case 'running': return Loader2
    default: return Circle
  }
}

function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'completed': return 'text-green-500'
    case 'failed': return 'text-red-500'
    case 'running': return 'text-primary'
    case 'isolated': return 'text-orange-500'
    default: return 'text-text-muted/30'
  }
}
</script>

<template>
  <div class="autopilot-chapter-nav h-full flex flex-col border-r border-border-light bg-bg-surface">
    <div class="flex items-center justify-between border-b border-border-light px-4 py-3">
      <h3 class="text-xs text-text-muted font-bold tracking-widest uppercase">
        章节列表
      </h3>
      <span class="text-[10px] text-text-muted">
        {{ completedCount }} / {{ jobs.length }}
      </span>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
      <button
        v-for="ch in sortedChapters"
        :key="ch.id"
        class="group w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-all"
        :class="currentChapterId === ch.id ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-bg-subtle'"
        @click="$emit('switch', ch.id)"
      >
        <component
          :is="getStatusIcon(jobMap.get(ch.id)?.status)"
          :size="14"
          :class="[getStatusColor(jobMap.get(ch.id)?.status), jobMap.get(ch.id)?.status === 'running' ? 'animate-spin' : '']"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-mono opacity-50">{{ ch.chapterNumber }}</span>
            <span class="truncate text-xs">{{ ch.title }}</span>
          </div>
          <template v-if="jobMap.get(ch.id)?.stepSummary && jobMap.get(ch.id)!.stepSummary!.totalSteps > 0">
            <div class="mt-1">
              <div class="h-0.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                <div
                  class="h-full transition-all duration-300"
                  :class="getStepBarColor(jobMap.get(ch.id)?.status)"
                  :style="{ width: `${(jobMap.get(ch.id)!.stepSummary!.completedSteps / jobMap.get(ch.id)!.stepSummary!.totalSteps) * 100}%` }"
                />
              </div>
              <div v-if="jobMap.get(ch.id)?.stepSummary?.currentStepLabel" class="mt-0.5 truncate text-[9px] text-text-muted">
                {{ jobMap.get(ch.id)!.stepSummary!.currentStepLabel }}
              </div>
            </div>
          </template>
        </div>
      </button>

      <div v-if="sortedChapters.length === 0" class="py-10 text-center text-xs text-text-muted">
        暂无章节
      </div>
    </div>
  </div>
</template>
