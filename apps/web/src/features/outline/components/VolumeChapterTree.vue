<script setup lang="ts">
import type { Chapter, Volume } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Library,
  Plus,
} from 'lucide-vue-next'

defineProps<{
  volumes: Volume[]
  chapters: Chapter[]
  expandedVolumes: Record<string, boolean>
  selectedChapterId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleVolume: [id: string]
  addChapter: [volumeId: string]
  addVolume: []
}>()
</script>

<template>
  <aside class="w-72 flex shrink-0 flex-col border-r border-border-light bg-bg-surface">
    <div class="flex items-center justify-between border-b border-border-light p-4">
      <h2 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
        <Layers :size="16" /> 故事结构
      </h2>
      <NButton variant="ghost" size="sm" aria-label="添加分卷" @click="emit('addVolume')">
        <Plus :size="16" />
      </NButton>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-2">
      <div v-if="volumes.length === 0" class="py-8 text-center">
        <p class="mb-3 text-xs text-text-muted">
          尚未定义任何卷。
        </p>
        <NButton size="sm" @click="emit('addVolume')">
          创建第 1 卷
        </NButton>
      </div>

      <div v-for="vol in volumes" :key="vol.id" class="space-y-1">
        <button
          class="group w-full flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-bg-subtle"
          @click="emit('toggleVolume', vol.id)"
        >
          <component :is="expandedVolumes[vol.id] ? ChevronDown : ChevronRight" :size="14" class="text-text-muted" />
          <Library :size="16" class="text-text-secondary" />
          <span class="flex-1 truncate text-left text-sm text-text-primary font-bold">{{ vol.title }}</span>
          <Plus
            :size="14"
            class="text-text-muted opacity-0 transition-all hover:text-primary group-hover:opacity-100"
            @click.stop="emit('addChapter', vol.id)"
          />
        </button>

        <div v-if="expandedVolumes[vol.id]" class="pl-6 space-y-1">
          <button
            v-for="ch in chapters.filter(c => c.volumeId === vol.id).sort((a, b) => a.chapterNumber - b.chapterNumber)"
            :key="ch.id"
            class="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-all"
            :class="selectedChapterId === ch.id
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-text-secondary hover:bg-bg-subtle'"
            @click="emit('select', ch.id)"
          >
            <div class="h-5 w-5 flex shrink-0 items-center justify-center border border-current rounded-full text-[10px]">
              {{ ch.chapterNumber }}
            </div>
            <span class="flex-1 truncate">{{ ch.title }}</span>
            <div v-if="ch.status === 'completed'" class="h-1.5 w-1.5 rounded-full bg-semantic-success" />
          </button>

          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted italic transition-colors hover:text-primary"
            @click="emit('addChapter', vol.id)"
          >
            <Plus :size="12" /> 添加章节...
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
