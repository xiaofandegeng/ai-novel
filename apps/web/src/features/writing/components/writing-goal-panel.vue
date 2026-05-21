<script setup lang="ts">
import type { WritingGoalProgress } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { Target } from 'lucide-vue-next'

defineProps<{
  progress: WritingGoalProgress | null
  todayStats: { wordsAdded: number, aiWordsAccepted: number, manualWordsAdded: number } | null
  loading: boolean
}>()

const emit = defineEmits<{
  setGoal: []
  viewDetails: []
}>()
</script>

<template>
  <div class="border border-border-light rounded-lg bg-bg-surface p-4 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold">
        <Target :size="14" /> 写作目标
      </h3>
      <NButton variant="ghost" size="sm" @click="emit('setGoal')">
        设定目标
      </NButton>
    </div>

    <div v-if="!progress && !loading" class="py-3 text-center text-xs text-text-muted">
      暂未设定写作目标
    </div>

    <div v-else-if="progress" class="space-y-3">
      <!-- Progress bar -->
      <div>
        <div class="mb-1 flex items-center justify-between text-xs">
          <span class="text-text-muted">
            {{ progress.goal.goalType === 'daily_words' ? '今日' : progress.goal.goalType === 'weekly_words' ? '本周' : progress.goal.goalType === 'chapters' ? '章节' : '总进度' }}
          </span>
          <span class="text-text-primary font-medium">{{ progress.percentage }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-bg-page">
          <div
            class="h-full rounded-full bg-primary transition-all"
            :style="{ width: `${progress.percentage}%` }"
          />
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-md bg-bg-page p-2">
          <div class="text-sm text-text-primary font-bold">
            {{ progress.currentWords }}
          </div>
          <div class="text-xs text-text-muted">
            已写字数
          </div>
        </div>
        <div class="rounded-md bg-bg-page p-2">
          <div class="text-sm text-text-primary font-bold">
            {{ progress.goal.targetWords || progress.goal.targetChapters || '-' }}
          </div>
          <div class="text-xs text-text-muted">
            目标
          </div>
        </div>
        <div class="rounded-md bg-bg-page p-2">
          <div class="text-sm text-text-primary font-bold">
            {{ progress.daysRemaining }}
          </div>
          <div class="text-xs text-text-muted">
            剩余天数
          </div>
        </div>
      </div>

      <!-- Today's stats -->
      <div v-if="todayStats" class="border-t border-border-light pt-2">
        <div class="text-xs text-text-muted">
          今日: {{ todayStats.wordsAdded }} 字
          <span v-if="todayStats.aiWordsAccepted > 0" class="text-ai"> (AI 接受: {{ todayStats.aiWordsAccepted }})</span>
          <span v-if="todayStats.manualWordsAdded > 0"> (手写: {{ todayStats.manualWordsAdded }})</span>
        </div>
      </div>
    </div>
  </div>
</template>
