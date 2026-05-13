<script setup lang="ts">
import { NTextArea } from '@ai-novel/ui'

const form = defineModel<{
  title: string
  summary: string
}>({ required: true })
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto p-6 space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h2 class="flex items-center gap-2 text-2xl text-text-primary font-bold">
          <span class="text-primary">分卷规划</span>
          <span class="text-lg text-text-muted font-normal">/ {{ form.title }}</span>
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          定义本卷的核心任务、主要矛盾与转折点
        </p>
      </div>
    </header>

    <div class="flex-1 space-y-4">
      <NTextArea
        v-model="form.summary"
        label="分卷大纲摘要"
        placeholder="本卷的主要剧情走向、核心冲突及对全书主线的推进作用..."
        class="h-full min-h-[400px]"
      />
    </div>
  </div>
</template>
