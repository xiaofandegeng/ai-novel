<script setup lang="ts">
import type { Component } from 'vue'
import {
  AlertTriangle,
  Sparkles,
} from 'lucide-vue-next'

export interface DimensionItem {
  label: string
  score: number
  description: string
  icon: Component
}

defineProps<{
  dimensions: DimensionItem[]
  issues: string[]
  suggestions: string[]
  hasEnoughText: boolean
  wordCount: number
}>()
</script>

<template>
  <div>
    <div v-if="!hasEnoughText" class="mb-5 flex items-start gap-3 border border-semantic-warning/20 rounded-lg bg-semantic-warning/10 p-4">
      <AlertTriangle :size="18" class="mt-0.5 text-semantic-warning" />
      <div>
        <div class="text-sm text-text-primary font-semibold">
          正文样本偏短
        </div>
        <p class="mt-1 text-sm text-text-secondary">
          建议正文超过 500 字，目前仅 {{ wordCount }} 字。评估结果可能不准确。
        </p>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div
        v-for="item in dimensions"
        :key="item.label"
        class="border border-border-light rounded-lg bg-bg-subtle/60 p-4"
      >
        <div class="mb-4 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="h-9 w-9 flex items-center justify-center rounded-lg bg-bg-surface text-primary">
              <component :is="item.icon" :size="18" />
            </span>
            <div class="text-sm text-text-primary font-semibold">
              {{ item.label }}
            </div>
          </div>
          <span class="text-xl text-text-primary font-bold">{{ item.score }}</span>
        </div>
        <div class="mb-3 h-2 overflow-hidden rounded-full bg-bg-muted">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${item.score}%` }" />
        </div>
        <p class="text-xs text-text-secondary leading-relaxed">
          {{ item.description }}
        </p>
      </div>
    </div>

    <div class="grid mt-8 gap-6 md:grid-cols-2">
      <div class="space-y-4">
        <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold">
          <AlertTriangle :size="16" class="text-semantic-error" /> 潜在问题
        </h3>
        <ul class="space-y-2">
          <li v-for="(issue, idx) in issues" :key="idx" class="border border-border-light rounded-lg bg-bg-surface p-3 text-sm text-text-secondary">
            {{ issue }}
          </li>
        </ul>
      </div>
      <div class="space-y-4">
        <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold">
          <Sparkles :size="16" class="text-primary" /> 修订建议
        </h3>
        <ul class="space-y-2">
          <li v-for="(sug, idx) in suggestions" :key="idx" class="border border-border-light rounded-lg bg-bg-surface p-3 text-sm text-text-secondary">
            {{ sug }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
