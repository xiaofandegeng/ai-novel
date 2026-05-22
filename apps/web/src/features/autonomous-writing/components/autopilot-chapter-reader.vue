<script setup lang="ts">
import type { AutonomousRunJob, Chapter } from '@ai-novel/shared'
import { NTag } from '@ai-novel/ui'
import { BookOpen, Loader2 } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  chapter: Chapter | undefined
  job: AutonomousRunJob | null
  loading: boolean
}>()

const wordCount = computed(() => {
  const content = props.chapter?.draft || ''
  return content ? content.replace(/\s/g, '').length : 0
})

function getJobStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'completed': return '已生成'
    case 'running': return '生成中'
    case 'failed': return '生成失败'
    case 'isolated': return '已隔离'
    case 'pending': return '等待中'
    default: return ''
  }
}

function getJobStatusVariant(status: string | undefined): string {
  switch (status) {
    case 'completed': return 'success'
    case 'running': return 'primary'
    case 'failed': return 'error'
    case 'isolated': return 'warning'
    default: return 'default'
  }
}
</script>

<template>
  <div class="autopilot-chapter-reader h-full flex flex-col overflow-hidden">
    <!-- Header -->
    <div v-if="chapter" class="flex items-center justify-between border-b border-border-light px-6 py-3">
      <div class="flex items-center gap-3">
        <BookOpen :size="16" class="text-primary" />
        <div>
          <h3 class="text-sm font-bold">
            第 {{ chapter.chapterNumber }} 章 · {{ chapter.title }}
          </h3>
          <p v-if="chapter.outline" class="line-clamp-1 mt-0.5 text-[10px] text-text-muted">
            {{ chapter.outline }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <NTag v-if="job" size="sm" :variant="getJobStatusVariant(job.status) as any">
          {{ getJobStatusLabel(job.status) }}
        </NTag>
        <span class="text-[10px] text-text-muted">{{ wordCount }} 字</span>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Empty / loading state -->
      <div v-if="!chapter || loading" class="h-full flex items-center justify-center">
        <div class="text-center">
          <Loader2 v-if="loading" :size="24" class="mx-auto mb-2 animate-spin text-primary" />
          <BookOpen v-else :size="32" class="mx-auto mb-3 text-text-muted/20" />
          <p class="text-sm text-text-muted">
            {{ loading ? '加载中...' : '请从左侧选择章节' }}
          </p>
        </div>
      </div>

      <!-- No content yet -->
      <div v-else-if="!chapter.draft" class="h-full flex items-center justify-center">
        <div class="text-center">
          <template v-if="job?.status === 'running'">
            <Loader2 :size="24" class="mx-auto mb-2 animate-spin text-primary" />
            <p class="text-sm text-text-muted">
              正在生成中...
            </p>
            <p v-if="job.stepSummary?.currentStepLabel" class="mt-1 text-xs text-text-muted">
              {{ job.stepSummary.currentStepLabel }}
            </p>
          </template>
          <template v-else>
            <BookOpen :size="32" class="mx-auto mb-3 text-text-muted/20" />
            <p class="text-sm text-text-muted">
              该章节尚未生成内容
            </p>
          </template>
        </div>
      </div>

      <!-- Chapter content -->
      <div v-else class="mx-auto max-w-3xl px-8 py-6">
        <div class="whitespace-pre-wrap break-words text-sm text-text-primary leading-[1.9] font-serif">
          {{ chapter.draft }}
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.autopilot-chapter-reader {
  font-family: 'Source Han Serif SC', 'Noto Serif SC', Georgia, serif;
}
</style>
