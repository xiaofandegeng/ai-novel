<script setup lang="ts">
import type { ForeshadowingItem } from '@ai-novel/shared'
import { NButton, NLoadingState, NTag } from '@ai-novel/ui'
import { AlertTriangle, Lightbulb, Sparkles } from 'lucide-vue-next'

const props = defineProps<{
  ganttBars: Array<{
    item: ForeshadowingItem
    start: number
    end: number
    color: string
    hasRisk: boolean
    riskLevel: string
  }>
  chapterNumbers: number[]
  maxChapter: number
  selectedItem: ForeshadowingItem | null
  riskReport: { risks: Array<{ id: string, title: string, riskType: string, riskLevel: string, message: string }>, summary: { high: number, medium: number, low: number } } | null
  payoffSuggestion: { suggestedChapter: string, suggestedMethod: string, reasoning: string } | null
  loadingSuggestion: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  navigate: [chapterId: string]
  suggestPayoff: []
}>()

const statusLabels: Record<string, string> = {
  open: '待回收',
  progressing: '推进中',
  paid_off: '已回收',
  abandoned: '已放弃',
}

const riskTypeLabels: Record<string, string> = {
  overdue: '过期',
  stagnant: '停滞',
  concentration: '集中',
  continuity: '连续性',
  orphaned: '未指定',
}

function barX(chapter: number) {
  if (props.maxChapter <= 1)
    return 0
  return (chapter / props.maxChapter) * 100
}

function barWidth(start: number, end: number) {
  return Math.max(barX(end) - barX(start), 2)
}
</script>

<template>
  <NLoadingState v-if="loading" />
  <div v-else class="space-y-4">
    <!-- Risk Summary -->
    <div v-if="riskReport && riskReport.risks.length > 0" class="flex items-center gap-4 border border-amber-200 rounded-lg bg-amber-50 px-4 py-3">
      <AlertTriangle :size="16" class="shrink-0 text-amber-500" />
      <div class="text-xs text-amber-800">
        <span class="font-bold">风险提示:</span>
        <span v-if="riskReport.summary.high > 0" class="ml-2 text-red-600">{{ riskReport.summary.high }} 高风险</span>
        <span v-if="riskReport.summary.medium > 0" class="ml-2 text-amber-600">{{ riskReport.summary.medium }} 中风险</span>
        <span v-if="riskReport.summary.low > 0" class="ml-2 text-gray-600">{{ riskReport.summary.low }} 低风险</span>
      </div>
    </div>

    <!-- Gantt Chart -->
    <div class="overflow-x-auto">
      <div class="min-w-[600px]">
        <!-- Chapter axis -->
        <div class="relative mb-2 h-6 border-b border-border-light">
          <div
            v-for="num in chapterNumbers"
            :key="num"
            class="absolute text-xs text-text-muted"
            :style="{ left: `${barX(num)}%`, transform: 'translateX(-50%)' }"
          >
            {{ num }}
          </div>
        </div>

        <!-- Bars -->
        <div class="space-y-1.5">
          <div
            v-for="bar in ganttBars"
            :key="bar.item.id"
            class="group flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-bg-subtle"
            :class="selectedItem?.id === bar.item.id ? 'bg-primary-soft' : ''"
            @click="emit('select', bar.item.id)"
          >
            <span class="w-32 shrink-0 truncate text-xs text-text-secondary" :title="bar.item.title">
              {{ bar.item.title }}
            </span>
            <div class="relative h-5 flex-1">
              <div
                class="absolute top-0.5 h-4 rounded-full opacity-80 transition-opacity group-hover:opacity-100"
                :style="{
                  left: `${barX(bar.start)}%`,
                  width: `${barWidth(bar.start, bar.end)}%`,
                  backgroundColor: bar.color,
                }"
              />
              <AlertTriangle v-if="bar.hasRisk" :size="12" class="absolute top-1 text-amber-500" :style="{ left: `${barX(bar.end) + 1}%` }" />
            </div>
            <NTag size="sm" :variant="bar.item.status === 'paid_off' ? 'success' : bar.item.status === 'open' ? 'info' : 'default'">
              {{ statusLabels[bar.item.status] || bar.item.status }}
            </NTag>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail panel -->
    <div v-if="selectedItem" class="border border-border-light rounded-lg p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="flex items-center gap-2 text-sm text-text-primary font-bold">
          <Lightbulb :size="14" /> {{ selectedItem.title }}
        </h4>
        <NButton variant="ai" size="sm" :loading="loadingSuggestion" @click="emit('suggestPayoff')">
          <Sparkles :size="12" class="mr-1" /> AI 兑现建议
        </NButton>
      </div>
      <p class="text-xs text-text-secondary">
        {{ selectedItem.description || '暂无描述' }}
      </p>

      <!-- Risk details for this item -->
      <div v-if="riskReport" class="space-y-1">
        <div
          v-for="risk in riskReport.risks.filter(r => selectedItem && r.id === selectedItem.id)"
          :key="risk.riskType"
          class="flex items-center gap-2 text-xs"
        >
          <span
            class="rounded-full px-1.5 py-0.5 font-medium"
            :class="risk.riskLevel === 'high' ? 'bg-red-100 text-red-700' : risk.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'"
          >
            {{ riskTypeLabels[risk.riskType] || risk.riskType }}
          </span>
          <span class="text-text-muted">{{ risk.message }}</span>
        </div>
      </div>

      <!-- AI Suggestion -->
      <div v-if="payoffSuggestion" class="border border-ai/15 rounded-md bg-ai-soft p-3 space-y-2">
        <p class="text-xs">
          <span class="text-text-primary font-bold">建议时机:</span> {{ payoffSuggestion.suggestedChapter }}
        </p>
        <p class="text-xs">
          <span class="text-text-primary font-bold">兑现方式:</span> {{ payoffSuggestion.suggestedMethod }}
        </p>
        <p class="text-xs text-text-secondary">
          {{ payoffSuggestion.reasoning }}
        </p>
      </div>
    </div>
  </div>
</template>
