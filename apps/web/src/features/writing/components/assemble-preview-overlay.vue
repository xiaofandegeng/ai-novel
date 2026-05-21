<script setup lang="ts">
import { NButton } from '@ai-novel/ui'

defineProps<{
  preview: {
    currentWordCount: number
    assembledWordCount: number
    content: string
    sceneCount: number
  } | null
}>()

const emit = defineEmits<{
  (e: 'confirm', mode: 'replace' | 'append'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div
    v-if="preview"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
  >
    <div class="max-w-lg w-full rounded-lg bg-bg-surface p-6 shadow-xl">
      <h3 class="mb-4 text-sm text-text-primary font-bold">
        确认组装章节
      </h3>
      <div class="mb-4 text-xs text-text-secondary space-y-2">
        <p>当前章节草稿：<span class="text-text-primary font-medium">{{ preview.currentWordCount }}</span> 字</p>
        <p>组装后内容：<span class="text-primary font-medium">{{ preview.assembledWordCount }}</span> 字（{{ preview.sceneCount }} 个场景）</p>
        <p v-if="preview.currentWordCount > 0" class="text-yellow-600">
          替换模式将覆盖当前章节草稿（替换前会自动保存快照）
        </p>
      </div>
      <div class="flex gap-3">
        <NButton variant="primary" size="sm" @click="emit('confirm', 'replace')">
          替换章节草稿
        </NButton>
        <NButton variant="ghost" size="sm" @click="emit('confirm', 'append')">
          追加到草稿末尾
        </NButton>
        <NButton variant="ghost" size="sm" @click="emit('cancel')">
          取消
        </NButton>
      </div>
    </div>
  </div>
</template>
