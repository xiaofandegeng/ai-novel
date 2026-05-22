<script setup lang="ts">
import { Bot, PenLine } from 'lucide-vue-next'

defineProps<{
  modelValue: 'manual' | 'autopilot'
}>()

defineEmits<{
  (e: 'update:modelValue', value: 'manual' | 'autopilot'): void
}>()
</script>

<template>
  <div class="autopilot-mode-toggle flex items-center gap-0.5 rounded-lg bg-bg-subtle p-0.5">
    <button
      class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
      :class="modelValue === 'manual'
        ? 'bg-bg-surface text-text-primary shadow-sm'
        : 'text-text-muted hover:text-text-secondary'"
      @click="$emit('update:modelValue', 'manual')"
    >
      <PenLine :size="14" />
      手动写作
    </button>
    <button
      class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
      :class="modelValue === 'autopilot'
        ? 'bg-primary/10 text-primary shadow-sm'
        : 'text-text-muted hover:text-text-secondary'"
      @click="$emit('update:modelValue', 'autopilot')"
    >
      <Bot :size="14" />
      自动驾驶
    </button>
  </div>
</template>
