<script setup lang="ts">
import type { ChapterScene, SceneStatus } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { Clapperboard, Layers } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  scenes: ChapterScene[]
  currentSceneId: string | null
}>()

const emit = defineEmits<{
  select: [sceneId: string]
  assemble: []
}>()

const statusColor: Record<SceneStatus, string> = {
  planned: 'bg-gray-200 text-gray-600',
  drafting: 'bg-blue-200 text-blue-600',
  reviewed: 'bg-yellow-200 text-yellow-600',
  completed: 'bg-green-200 text-green-600',
}

const statusLabel: Record<SceneStatus, string> = {
  planned: '规划',
  drafting: '写作',
  reviewed: '审核',
  completed: '完成',
}

const completedCount = computed(() => props.scenes.filter(s => s.status === 'completed' || s.status === 'reviewed').length)
</script>

<template>
  <div class="bg-bg-sidebar h-full w-56 flex flex-col border-r border-border-light">
    <div class="border-b border-border-light p-3">
      <h3 class="flex items-center gap-2 text-xs text-text-muted font-bold uppercase">
        <Clapperboard :size="14" /> 场景列表
      </h3>
      <p class="mt-1 text-xs text-text-muted">
        {{ completedCount }} / {{ scenes.length }} 已完成
      </p>
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <button
        v-for="scene in scenes"
        :key="scene.id"
        class="mb-1 w-full rounded-md px-3 py-2 text-left text-xs transition-colors"
        :class="currentSceneId === scene.id
          ? 'bg-primary/10 text-primary'
          : 'text-text-muted hover:bg-bg-page'"
        @click="emit('select', scene.id)"
      >
        <div class="flex items-center gap-2">
          <span class="h-5 w-5 flex items-center justify-center rounded-full bg-bg-page text-xs font-bold">
            {{ scene.sceneNumber }}
          </span>
          <span class="flex-1 truncate font-medium">{{ scene.title || '未命名' }}</span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            :class="statusColor[scene.status]"
          >
            {{ statusLabel[scene.status] }}
          </span>
        </div>
        <p v-if="scene.purpose" class="mt-1 truncate text-[11px] text-text-muted/70">
          {{ scene.purpose }}
        </p>
      </button>

      <div v-if="scenes.length === 0" class="py-8 text-center text-xs text-text-muted">
        暂无场景<br>请先在大纲页规划场景
      </div>
    </div>

    <div class="border-t border-border-light p-3">
      <NButton
        variant="ghost"
        size="sm"
        class="w-full"
        :disabled="completedCount === 0"
        @click="emit('assemble')"
      >
        <Layers :size="14" class="mr-1.5" /> 组装章节
      </NButton>
    </div>
  </div>
</template>
