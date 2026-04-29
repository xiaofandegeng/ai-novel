<script setup lang="ts">
import type { Component } from 'vue'
import { NTag } from '@ai-novel/ui'
import { ChevronRight, Filter } from 'lucide-vue-next'

export interface KnowledgeEntry {
  id: string
  title: string
  content: string
  type: string
  icon: Component
}

defineProps<{
  entries: KnowledgeEntry[]
}>()

const emit = defineEmits<{
  navigate: [entry: KnowledgeEntry]
}>()
</script>

<template>
  <div v-if="entries.length === 0" class="py-20 text-center opacity-30">
    <Filter :size="64" class="mx-auto mb-4" />
    <p class="text-lg">
      在创作节点中未找到匹配项。
    </p>
  </div>

  <div v-else class="grid gap-4">
    <div
      v-for="entry in entries"
      :key="entry.id"
      class="group animate-in flex cursor-pointer items-start gap-6 border border-border-light rounded-2xl bg-bg-surface p-6 transition-all hover:border-primary/30 hover:shadow-md"
      @click="emit('navigate', entry)"
    >
      <div class="h-12 w-12 flex items-center justify-center rounded-xl bg-bg-subtle text-text-secondary transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <component :is="entry.icon" :size="24" />
      </div>
      <div class="flex-1 space-y-1">
        <div class="flex items-center gap-3">
          <h3 class="text-lg text-text-primary font-bold transition-colors group-hover:text-primary">
            {{ entry.title }}
          </h3>
          <NTag size="sm" :variant="entry.type === 'character' ? 'primary' : entry.type === 'conflict' ? 'error' : 'info'" class="text-[9px] font-bold uppercase">
            {{ entry.type }}
          </NTag>
        </div>
        <p class="line-clamp-2 text-sm text-text-secondary leading-relaxed">
          {{ entry.content }}
        </p>
      </div>
      <ChevronRight :size="20" class="mt-4 text-text-muted transition-transform group-hover:translate-x-1" />
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
