<script setup lang="ts">
import type { Chapter } from '@ai-novel/shared'
import { ChevronLeft } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  chapters: Chapter[]
  currentChapterId: string
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'switch', id: string): void
}>()

const router = useRouter()

const sortedChapters = computed(() =>
  [...props.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber),
)
</script>

<template>
  <div class="h-full flex flex-col border-r border-border-light bg-bg-surface">
    <div class="flex items-center justify-between border-b border-border-light p-4">
      <button
        class="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-subtle hover:text-text-primary"
        @click="router.back()"
      >
        <ChevronLeft :size="20" />
      </button>
      <h3 class="text-xs text-text-muted font-bold tracking-widest uppercase">
        章节列表
      </h3>
      <div class="w-5" />
    </div>
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <button
        v-for="ch in sortedChapters"
        :key="ch.id"
        class="w-full flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-all"
        :class="currentChapterId === ch.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-secondary hover:bg-bg-subtle'"
        @click="emit('switch', ch.id)"
      >
        <span class="text-[10px] font-mono opacity-50">{{ ch.chapterNumber }}</span>
        <span class="truncate">{{ ch.title }}</span>
      </button>
    </div>
  </div>
</template>
