<script setup lang="ts">
import { NButton } from '@ai-novel/ui'
import { Sparkles } from 'lucide-vue-next'

defineProps<{
  aiSuggestion: string | null
  isBrainstorming: boolean
  theme?: string
  alternatives: string[]
}>()

const emit = defineEmits<{
  brainstorm: []
  confirm: [action: 'insert' | 'replace' | 'backup' | 'discard']
  applyAlternative: [index: number, action: 'insert' | 'replace']
  removeAlternative: [index: number]
}>()
</script>

<template>
  <aside class="hidden w-80 shrink-0 flex-col border-l border-border-light bg-bg-surface xl:flex">
    <div class="border-b border-border-light bg-bg-page/50 p-4">
      <h2 class="flex items-center gap-2 text-sm text-ai font-bold tracking-wider uppercase">
        <Sparkles :size="16" /> 大纲助手
      </h2>
    </div>
    <div class="overflow-y-auto p-6 space-y-6">
      <div v-if="aiSuggestion !== null || isBrainstorming" class="animate-in fade-in slide-in-from-right-4 border border-ai/10 rounded-xl bg-ai-soft p-4">
        <div class="mb-2 flex items-center justify-between">
          <p class="flex items-center gap-2 text-sm text-text-primary font-bold">
            <Sparkles :size="14" class="text-ai" /> AI 建议方案
          </p>
        </div>
        <div v-if="isBrainstorming && !aiSuggestion" class="py-4 space-y-2">
          <div class="h-2 w-3/4 animate-pulse rounded-full bg-ai/20" />
          <div class="h-2 w-1/2 animate-pulse rounded-full bg-ai/20" />
        </div>
        <div v-else class="mb-4 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs text-text-secondary leading-relaxed italic">
          {{ aiSuggestion }}
        </div>
        <div v-if="aiSuggestion" class="grid grid-cols-2 gap-2">
          <NButton size="sm" variant="ai" @click="emit('confirm', 'insert')">
            插入
          </NButton>
          <NButton size="sm" variant="ghost" @click="emit('confirm', 'replace')">
            替换
          </NButton>
          <NButton size="sm" variant="ghost" @click="emit('confirm', 'backup')">
            存为备选
          </NButton>
          <NButton size="sm" variant="ghost" @click="emit('confirm', 'discard')">
            丢弃
          </NButton>
        </div>
      </div>

      <div v-else class="group border border-border-light rounded-xl bg-bg-surface p-4 transition-colors hover:border-ai/30">
        <p class="mb-1 text-sm text-text-primary font-medium">
          生成章节计划
        </p>
        <p class="mb-4 text-xs text-text-secondary leading-relaxed">
          我将根据您的故事设定集，构思本章的关键事件与悬念。
        </p>
        <NButton variant="ghost" size="sm" class="w-full group-hover:bg-ai/5 group-hover:text-ai" @click="emit('brainstorm')">
          建议方案
        </NButton>
      </div>

      <div v-if="alternatives.length > 0" class="space-y-3">
        <h3 class="text-xs text-text-muted font-bold tracking-wider uppercase">
          备选方案
        </h3>
        <div
          v-for="(item, index) in alternatives"
          :key="`${index}-${item.slice(0, 16)}`"
          class="border border-border-light rounded-lg bg-bg-surface p-3"
        >
          <p class="line-clamp-4 whitespace-pre-wrap text-xs text-text-secondary leading-relaxed">
            {{ item }}
          </p>
          <div class="mt-2 flex gap-2">
            <NButton size="sm" variant="ghost" @click="emit('applyAlternative', index, 'insert')">
              插入
            </NButton>
            <NButton size="sm" variant="ghost" @click="emit('applyAlternative', index, 'replace')">
              替换
            </NButton>
            <NButton size="sm" variant="ghost" @click="emit('removeAlternative', index)">
              移除
            </NButton>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="text-xs text-text-muted font-bold tracking-wider uppercase">
          相关背景设定
        </h3>
        <div class="border border-border-light rounded-lg bg-bg-subtle p-3">
          <div class="mb-1 text-[10px] text-text-muted font-bold">
            世界观 / 主题
          </div>
          <p class="line-clamp-4 text-xs text-text-primary">
            {{ theme || '尚未定义主题。' }}
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>
