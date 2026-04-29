<script setup lang="ts">
import type { KnowledgeSource } from '@ai-novel/shared'
import { BookOpen } from 'lucide-vue-next'

defineProps<{
  sources: KnowledgeSource[]
  uploading: boolean
}>()

const emit = defineEmits<{
  select: [source: KnowledgeSource]
}>()
</script>

<template>
  <div v-if="sources.length === 0 && !uploading" class="col-span-full py-20 text-center opacity-30">
    <BookOpen :size="64" class="mx-auto mb-4" />
    <p>暂无参考素材。</p>
  </div>

  <div v-else class="animate-in grid grid-cols-1 gap-6 lg:grid-cols-3 md:grid-cols-2">
    <div
      v-for="source in sources"
      :key="source.id"
      class="group cursor-pointer overflow-hidden border border-border-light rounded-2xl bg-bg-surface shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
      @click="emit('select', source)"
    >
      <div class="relative h-32 flex items-center justify-center overflow-hidden border-b border-border-light bg-bg-subtle">
        <BookOpen :size="48" class="text-text-muted transition-colors group-hover:text-primary/50" />
        <div v-if="source.status === 'processing'" class="absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-[2px]">
          <div class="h-6 w-6 animate-spin border-2 border-primary/30 border-t-primary rounded-full" />
        </div>
      </div>
      <div class="p-4 space-y-1">
        <h4 class="truncate text-text-primary font-bold">
          {{ source.title }}
        </h4>
        <p class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
          {{ source.status }} · {{ Math.round((source.fileSize || 0) / 1024) }}KB
        </p>
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
