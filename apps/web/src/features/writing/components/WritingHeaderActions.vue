<script setup lang="ts">
import { NButton } from '@ai-novel/ui'
import {
  Brain,
  Clapperboard,
  Clock,
  History,
  Maximize2,
  Minimize2,
  ShieldCheck,
} from 'lucide-vue-next'

defineProps<{
  sceneMode: boolean
  sceneSaveError: boolean
  activeSaving: boolean
  activeWordCount: number
  fullScreen: boolean
  updatingMemory: boolean
  draftExists: boolean
}>()

const emit = defineEmits<{
  (e: 'update:sceneMode', value: boolean): void
  (e: 'update:fullScreen', value: boolean): void
  (e: 'snapshot'): void
  (e: 'updateMemory'): void
  (e: 'runQualityAudit'): void
}>()
</script>

<template>
  <div class="flex items-center gap-4">
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors"
      :class="sceneMode ? 'bg-primary text-white' : 'bg-bg-surface text-text-muted hover:text-primary'"
      @click="emit('update:sceneMode', !sceneMode)"
    >
      <Clapperboard :size="12" />
      {{ sceneMode ? '场景模式' : '章节模式' }}
    </button>
    <div class="flex items-center gap-1.5 text-xs text-text-muted">
      <template v-if="sceneMode && sceneSaveError">
        <span class="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span class="text-red-500">场景保存失败</span>
      </template>
      <template v-else-if="activeSaving">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        保存中...
      </template>
      <template v-else>
        <Clock :size="12" />
        已保存
      </template>
    </div>
    <NButton
      variant="ghost"
      size="sm"
      class="text-text-muted hover:text-primary"
      @click="emit('snapshot')"
    >
      <History :size="16" class="mr-1.5" /> 保存快照
    </NButton>
    <NButton
      variant="ghost"
      size="sm"
      :disabled="!draftExists || updatingMemory"
      :loading="updatingMemory"
      class="text-text-muted hover:text-ai"
      @click="emit('updateMemory')"
    >
      <Brain :size="16" class="mr-1.5" /> 更新记忆
    </NButton>
    <NButton
      variant="ghost"
      size="sm"
      :disabled="!draftExists"
      class="text-text-muted hover:text-semantic-warning"
      title="进行主题与人设对齐审计"
      @click="emit('runQualityAudit')"
    >
      <ShieldCheck :size="16" class="mr-1.5" /> 质量审计
    </NButton>
    <div class="h-4 w-px bg-border-light" />
    <div class="text-xs text-text-muted font-medium">
      {{ activeWordCount }} 字
    </div>
    <NButton variant="ghost" size="sm" @click="emit('update:fullScreen', !fullScreen)">
      <component :is="fullScreen ? Minimize2 : Maximize2" :size="16" />
    </NButton>
  </div>
</template>
