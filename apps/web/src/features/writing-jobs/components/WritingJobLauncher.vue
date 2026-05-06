<script setup lang="ts">
import type { WritingJobMode } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { Bot } from 'lucide-vue-next'
import { MODE_LABEL } from '../composables/useWritingJobController'

defineProps<{
  creating: boolean
}>()

const emit = defineEmits<{
  create: []
}>()

const form = defineModel<WritingJobMode>({ required: true })
</script>

<template>
  <div class="border border-border-light rounded-lg bg-bg-surface p-6 space-y-4">
    <div class="mb-2 flex items-center gap-3">
      <Bot :size="20" class="text-primary" />
      <h3 class="text-sm text-text-primary font-bold">
        创建写作任务
      </h3>
    </div>

    <div>
      <label class="mb-2 block text-xs text-text-muted">写作模式</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="(label, mode) in MODE_LABEL"
          :key="mode"
          class="border rounded-lg p-3 text-center text-sm transition-colors"
          :class="form === mode ? 'border-primary bg-primary-soft text-primary' : 'border-border-light text-text-secondary hover:bg-bg-subtle'"
          @click="form = mode as WritingJobMode"
        >
          {{ label }}
        </button>
      </div>
    </div>

    <div class="flex justify-end">
      <NButton :loading="creating" @click="emit('create')">
        创建任务
      </NButton>
    </div>
  </div>
</template>
