<script setup lang="ts">
import type { QualityReport } from '@ai-novel/shared'
import { NPanel } from '@ai-novel/ui'
import { History } from 'lucide-vue-next'

defineProps<{
  reports: QualityReport[]
  selectedReportId: string | null
}>()

const emit = defineEmits<{
  select: [report: QualityReport]
}>()
</script>

<template>
  <NPanel title="历史报告" description="过往评估记录" padding>
    <div v-if="reports.length === 0" class="py-10 text-center text-sm text-text-muted">
      尚无评估历史。
    </div>
    <div v-else class="space-y-2">
      <button
        v-for="report in reports"
        :key="report.id"
        class="w-full border rounded-lg p-3 text-left transition-colors"
        :class="selectedReportId === report.id
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-border-light bg-bg-surface text-text-secondary hover:bg-bg-subtle'"
        @click="emit('select', report)"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-bold uppercase opacity-60">
              {{ new Date(report.createdAt).toLocaleDateString() }}
            </div>
            <div class="mt-1 truncate text-sm font-semibold">
              得分: {{ report.score }}
            </div>
          </div>
          <History :size="15" class="opacity-40" />
        </div>
      </button>
    </div>
  </NPanel>
</template>
