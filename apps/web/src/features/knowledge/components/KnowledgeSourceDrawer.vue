<script setup lang="ts">
import type { KnowledgeSourceDetail } from '@ai-novel/shared'
import { NTag } from '@ai-novel/ui'
import { ChevronRight } from 'lucide-vue-next'

defineProps<{
  source: KnowledgeSourceDetail
}>()

const emit = defineEmits<{
  back: []
}>()
</script>

<template>
  <div class="animate-in space-y-8">
    <button class="mb-4 flex items-center gap-2 text-sm text-primary font-bold" @click="emit('back')">
      <ChevronRight class="rotate-180" :size="16" /> 返回书库
    </button>

    <div class="border border-border-light rounded-lg bg-bg-surface p-8 shadow-sm space-y-6">
      <div>
        <h2 class="text-2xl text-text-primary font-bold">
          {{ source.title }}
        </h2>
        <p class="text-text-muted">
          作者：{{ source.author || '未知' }}
        </p>
      </div>

      <div class="grid grid-cols-3 gap-4 border-y border-border-light py-6">
        <div class="p-4 text-center">
          <div class="text-2xl text-primary font-bold">
            {{ source.chunks?.length || 0 }}
          </div>
          <div class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
            章节数
          </div>
        </div>
        <div class="border-x border-border-light p-4 text-center">
          <div class="text-2xl text-primary font-bold">
            {{ source.status }}
          </div>
          <div class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
            分析状态
          </div>
        </div>
        <div class="p-4 text-center">
          <div class="text-2xl text-primary font-bold">
            {{ Math.round((source.fileSize || 0) / 1024) }}KB
          </div>
          <div class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
            文件大小
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm text-text-muted font-bold tracking-widest uppercase">
          内容拆解
        </h3>
        <div class="space-y-4">
          <div v-for="chunk in source.chunks" :key="chunk.id" class="border border-border-light rounded-xl p-4 transition-all hover:border-primary/20">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-bold">{{ chunk.title }}</span>
              <NTag size="sm" variant="info">
                AI 已分析
              </NTag>
            </div>
            <p class="mb-3 text-xs text-text-secondary leading-relaxed">
              {{ chunk.summary }}
            </p>
            <div v-if="chunk.techniques" class="border border-primary/10 rounded-lg bg-primary/5 p-3">
              <span class="mb-1 block text-[9px] text-primary font-bold uppercase">技法洞察</span>
              <p class="text-[11px] text-text-primary italic">
                {{ chunk.techniques }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-in {
  animation: slide-in 0.4s ease-out both;
}
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
