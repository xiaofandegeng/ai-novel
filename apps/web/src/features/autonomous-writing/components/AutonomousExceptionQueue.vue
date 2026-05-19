<script setup lang="ts">
import type { TagVariant } from '@ai-novel/ui'
import { NButton, NTag } from '@ai-novel/ui'

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Eye,
  MoreVertical,
  XCircle,
} from 'lucide-vue-next'

defineProps<{
  exceptions: any[]
}>()

const emit = defineEmits<{
  (e: 'view', ex: any): void
  (e: 'resolve', ex: any): void
  (e: 'ignore', ex: any): void
}>()

function getSeverityVariant(severity: string): TagVariant {
  switch (severity) {
    case 'critical': return 'error'
    case 'high': return 'error'
    case 'medium': return 'warning'
    default: return 'default'
  }
}

function getExceptionIcon(type: string) {
  switch (type) {
    case 'consistency_blocked': return Activity
    case 'high_risk_change_set': return AlertTriangle
    case 'apply_failed': return XCircle
    default: return AlertTriangle
  }
}
</script>

<template>
  <div class="autonomous-exception-queue space-y-4">
    <div class="mb-4 flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <AlertTriangle :size="18" class="text-warning" />
        <h3 class="text-sm font-bold">
          异常队列 ({{ exceptions.length }})
        </h3>
      </div>
      <a href="#" class="text-[10px] text-primary hover:underline">处理记录</a>
    </div>

    <div class="space-y-3">
      <div
        v-for="ex in exceptions"
        :key="ex.id"
        class="overflow-hidden border rounded-md bg-bg-surface transition-all hover:shadow-md"
        :class="ex.severity === 'critical' ? 'border-red-300' : 'border-border-light'"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between border-b px-3 py-2"
          :class="ex.severity === 'critical' ? 'bg-red-50 border-red-100' : 'bg-bg-subtle border-border-light'"
        >
          <div class="flex items-center gap-2">
            <component :is="getExceptionIcon(ex.exceptionType)" :size="14" :class="ex.severity === 'critical' ? 'text-red-600' : 'text-warning'" />
            <span class="text-xs font-bold">{{ ex.title }}</span>
          </div>
          <NTag size="sm" :variant="getSeverityVariant(ex.severity) as any">
            {{ ex.severity.toUpperCase() }}
          </NTag>
        </div>

        <!-- Body -->
        <div class="p-3">
          <p class="mb-3 text-xs text-text-secondary leading-relaxed">
            {{ ex.description }}
          </p>

          <div class="mb-3 flex items-center gap-2">
            <div class="flex items-center gap-1 rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
              章节: {{ ex.chapterId?.slice(0, 8) }}
            </div>
            <div v-if="ex.changeSetId" class="flex items-center gap-1 rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
              变更集: {{ ex.changeSetId?.slice(0, 8) }}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-2">
            <NButton size="sm" variant="primary" @click="emit('view', ex)">
              <Eye :size="12" class="mr-1" /> 查看详情
            </NButton>
            <NButton size="sm" outline @click="emit('resolve', ex)">
              <CheckCircle :size="12" class="mr-1" /> 恢复自动运行
            </NButton>
            <NButton size="sm" outline class="ml-auto">
              <MoreVertical :size="12" />
            </NButton>
          </div>
        </div>
      </div>

      <div v-if="exceptions.length === 0" class="border-2 border-border-light rounded-lg border-dashed py-12 text-center opacity-40">
        <CheckCircle :size="32" class="mx-auto mb-2 text-green-500" />
        <p class="text-xs">
          当前无未处理异常
        </p>
      </div>
    </div>
  </div>
</template>
