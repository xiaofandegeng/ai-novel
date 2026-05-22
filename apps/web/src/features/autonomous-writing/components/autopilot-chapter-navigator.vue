<script setup lang="ts">
import type { AutonomousRunJob } from '@ai-novel/shared'
import type { Chapter } from '@ai-novel/shared'
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

function getJobForChapter(chapterId: string): AutonomousRunJob | undefined {
  return props.jobs.find(j => j.chapterId === chapterId)
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

function getJobStatus(job: AutonomousRunJob | undefined): string | undefined {
  return job?.status
}
</script>

<template>
  <div class="autopilot-chapter-nav h-full flex flex-col border-r border-border-light bg-bg-surface">
    <div class="flex items-center justify-between border-b border-border-light px-4 py-3">
      <h3 class="text-xs text-text-muted font-bold tracking-widest uppercase">
        章节列表
      </h3>
      <span class="text-[10px] text-text-muted">
        {{ jobs.filter(j => j.status === 'completed').length }} / {{ jobs.length }}
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
          :is="getStatusIcon(getJobStatus(getJobForChapter(ch.id)))"
          :size="14"
          :class="[getStatusColor(getJobStatus(getJobForChapter(ch.id))), getJobStatus(getJobForChapter(ch.id)) === 'running' ? 'animate-spin' : '']"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-mono opacity-50">{{ ch.chapterNumber }}</span>
            <span class="truncate text-xs">{{ ch.title }}</span>
          </div>
          <div
            v-if="getJobForChapter(ch.id)?.stepSummary && getJobForChapter(ch.id)!.stepSummary!.totalSteps > 0"
            class="mt-1"
          >
            <div class="h-0.5 w-full overflow-hidden rounded-full bg-bg-subtle">
              <div
                class="h-full transition-all duration-300"
                :class="getJobStatus(getJobForChapter(ch.id)) === 'running' ? 'bg-primary' : getJobStatus(getJobForChapter(ch.id)) === 'completed' ? 'bg-green-500' : 'bg-border-light'"
                :style="{ width: `${(getJobForChapter(ch.id)!.stepSummary!.completedSteps / getJobForChapter(ch.id)!.stepSummary!.totalSteps) * 100}%` }"
              />
            </div>
            <div v-if="getJobForChapter(ch.id)?.stepSummary?.currentStepLabel" class="mt-0.5 text-[9px] text-text-muted truncate">
              {{ getJobForChapter(ch.id)!.stepSummary!.currentStepLabel }}
            </div>
          </div>
        </div>
      </button>

      <div v-if="sortedChapters.length === 0" class="py-10 text-center text-xs text-text-muted">
        暂无章节
      </div>
    </div>
  </div>
</template>
