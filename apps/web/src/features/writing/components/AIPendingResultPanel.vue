<script setup lang="ts">
import type { PendingAIResult } from '../composables/useAIResultConfirm'
import { NButton } from '@ai-novel/ui'
import { Sparkles } from 'lucide-vue-next'

defineProps<{
  result: PendingAIResult | null
}>()

const emit = defineEmits<{
  (e: 'confirm', action: 'insert' | 'replace' | 'backup' | 'discard'): void
}>()
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
  >
    <div v-if="result && result.content" class="border border-ai/20 rounded-lg bg-ai-soft/30 p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles :size="20" class="animate-pulse text-ai" />
          <div>
            <h3 class="text-sm text-ai font-bold tracking-wider uppercase">
              AI 创作迭代建议
            </h3>
            <p class="text-[10px] text-text-muted uppercase">
              等待确认
            </p>
          </div>
        </div>
        <NButton variant="ghost" size="sm" @click="emit('confirm', 'discard')">
          放弃
        </NButton>
      </div>

      <div class="max-h-64 overflow-y-auto border border-ai/10 rounded-md bg-bg-surface p-4 text-sm text-text-primary leading-relaxed">
        {{ result.content }}
      </div>

      <div v-if="result.originalText" class="px-2 text-[10px] text-text-muted italic">
        将替换当前选中的文字：{{ result.originalText.substring(0, 40) }}{{ result.originalText.length > 40 ? '…' : '' }}
      </div>

      <div class="grid grid-cols-2 items-center gap-3 sm:flex">
        <NButton v-if="result.originalText" class="flex-1" variant="ai" @click="emit('confirm', 'replace')">
          替换选中项
        </NButton>
        <NButton class="flex-1" variant="ai" @click="emit('confirm', 'insert')">
          {{ result.originalText ? '在选中处插入' : '在光标处插入' }}
        </NButton>
        <NButton class="flex-1" variant="secondary" @click="emit('confirm', 'backup')">
          存为备份版本
        </NButton>
      </div>
    </div>
  </Transition>
</template>
