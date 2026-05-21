<script setup lang="ts">
import { NTextArea } from '@ai-novel/ui'

const form = defineModel<{
  title: string
  description: string
  genre: string
  theme: string
}>({ required: true })
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto p-6 space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h2 class="flex items-center gap-2 text-2xl text-text-primary font-bold">
          <span class="text-primary">全书规划</span>
          <span class="text-lg text-text-muted font-normal">/ {{ form.title }}</span>
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          定义作品的顶层基调、核心主题与全书大纲概要
        </p>
      </div>
    </header>

    <div class="grid grid-cols-2 gap-6">
      <div class="space-y-4">
        <label class="block text-sm text-text-secondary font-semibold">类型与基调</label>
        <input
          v-model="form.genre"
          type="text"
          class="w-full border border-border-light rounded-lg bg-bg-subtle px-4 py-2 text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="如：玄幻、都市异能、悬疑..."
        >
      </div>
      <div class="space-y-4">
        <label class="block text-sm text-text-secondary font-semibold">核心主题</label>
        <input
          v-model="form.theme"
          type="text"
          class="w-full border border-border-light rounded-lg bg-bg-subtle px-4 py-2 text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="如：成长、复仇、宿命与反抗..."
        >
      </div>
    </div>

    <div class="flex-1 space-y-4">
      <NTextArea
        v-model="form.description"
        label="全书剧情概要（全书大纲）"
        placeholder="简述全书的核心线索、起承转合与预期结局..."
        class="h-full min-h-[400px]"
      />
    </div>
  </div>
</template>
