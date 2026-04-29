<script setup lang="ts">
import { NTag } from '@ai-novel/ui'
import { BarChart3 } from 'lucide-vue-next'

defineProps<{
  overallScore: number
}>()
</script>

<template>
  <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <div class="mb-3 flex items-center gap-2">
        <span class="h-10 w-10 flex items-center justify-center rounded-lg bg-primary-soft text-primary">
          <BarChart3 :size="22" />
        </span>
        <NTag variant="info" size="sm">
          编辑评估
        </NTag>
      </div>
      <h1 class="text-3xl text-text-primary font-bold">
        质量评估工作台
      </h1>
      <p class="mt-2 max-w-2xl text-sm text-text-secondary leading-relaxed">
        基于 AI 深度分析章节的创作质量，提供可落地的修改建议。
      </p>
    </div>

    <div class="border border-border-light rounded-lg bg-bg-surface p-4 shadow-sm">
      <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
        综合评分
      </div>
      <div class="mt-1 flex items-end gap-2">
        <span class="text-4xl text-text-primary font-bold">{{ overallScore }}</span>
        <span class="pb-1 text-sm text-text-muted">/ 100</span>
      </div>
    </div>
  </div>
</template>
