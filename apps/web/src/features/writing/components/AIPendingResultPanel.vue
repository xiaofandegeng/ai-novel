<script setup lang="ts">
import type { PendingAIResult } from '../composables/useAIResultConfirm'
import { NButton } from '@ai-novel/ui'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import AIQualityFeedbackPanel from '../../../components/AIQualityFeedbackPanel.vue'

const props = defineProps<{
  result: PendingAIResult | null
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'confirm', action: 'insert' | 'replace' | 'backup' | 'discard'): void
}>()

const isBlocked = computed(() => props.result?.consistencyReport?.overallStatus === 'blocked')
const isChecking = computed(() => props.result?.isCheckingConsistency)

const showFeedback = ref(false)

function handleAction(action: 'insert' | 'replace' | 'backup' | 'discard') {
  emit('confirm', action)
  if (action !== 'backup') {
    showFeedback.value = true
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
  >
    <div v-if="result && result.content" class="border border-ai/20 rounded-lg bg-ai-soft/30 p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles :size="20" class="animate-pulse text-ai" />
          <div>
            <h3 class="text-sm text-ai font-bold tracking-wider uppercase">
              AI 创作迭代建议
            </h3>
            <p class="text-[10px] text-text-muted uppercase">
              等待确认
            </p>
          </div>
        </div>
        <NButton variant="ghost" size="sm" @click="handleAction('discard')">
          放弃
        </NButton>
      </div>

      <div class="max-h-64 overflow-y-auto border border-ai/10 rounded-md bg-bg-surface p-4 text-sm text-text-primary leading-relaxed">
        {{ result.content }}
      </div>

      <!-- Consistency Report -->
      <div v-if="isChecking || result.consistencyReport" class="border border-border-light rounded-md bg-bg-page/50 p-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <Loader2 v-if="isChecking" :size="14" class="animate-spin text-ai" />
            <CheckCircle2 v-else-if="result.consistencyReport?.overallStatus === 'pass'" :size="14" class="text-semantic-success" />
            <AlertTriangle v-else-if="result.consistencyReport?.overallStatus === 'warning'" :size="14" class="text-semantic-warning" />
            <XCircle v-else :size="14" class="text-semantic-error" />
            <span
              class="text-[10px] font-bold tracking-wider uppercase" :class="{
                'text-ai': isChecking,
                'text-semantic-success': result.consistencyReport?.overallStatus === 'pass',
                'text-semantic-warning': result.consistencyReport?.overallStatus === 'warning',
                'text-semantic-error': result.consistencyReport?.overallStatus === 'blocked',
              }"
            >
              {{ isChecking ? '正在审查创作一致性...' : `一致性守卫: ${result.consistencyReport?.overallStatus === 'pass' ? '通过' : result.consistencyReport?.overallStatus === 'warning' ? '提醒' : '阻断'}` }}
            </span>
          </div>
          <span v-if="result.consistencyReport" class="text-[10px] text-text-muted font-mono">{{ result.consistencyReport.score }}分</span>
        </div>
        <p v-if="result.consistencyReport?.risks.length" class="mt-1.5 text-[11px] text-text-secondary leading-normal">
          {{ result.consistencyReport.risks[0].message }}
        </p>
      </div>

      <div v-if="result.originalText" class="px-2 text-[10px] text-text-muted italic">
        将替换当前选中的文字：{{ result.originalText.substring(0, 40) }}{{ result.originalText.length > 40 ? '…' : '' }}
      </div>

      <div class="grid grid-cols-2 items-center gap-3 sm:flex">
        <NButton
          v-if="result.originalText"
          class="flex-1"
          variant="ai"
          :disabled="isBlocked || isChecking"
          :title="isBlocked ? '一致性检查未通过，禁止直接应用' : ''"
          @click="handleAction('replace')"
        >
          替换选中项
        </NButton>
        <NButton
          class="flex-1"
          variant="ai"
          :disabled="isBlocked || isChecking"
          :title="isBlocked ? '一致性检查未通过，禁止直接应用' : ''"
          @click="handleAction('insert')"
        >
          {{ result.originalText ? '在选中处插入' : '在光标处插入' }}
        </NButton>
        <NButton class="flex-1" variant="secondary" @click="handleAction('backup')">
          存为备份版本
        </NButton>
      </div>

      <!-- Quality Feedback -->
      <Transition
        enter-active-class="transition duration-500 ease-out"
        enter-from-class="opacity-0 max-h-0"
        enter-to-class="opacity-100 max-h-[400px]"
      >
        <div v-if="showFeedback && result" class="mt-4">
          <AIQualityFeedbackPanel
            :project-id="projectId"
            :context-snapshot-id="result.contextSnapshotId"
            :model-provider="result.modelProvider || 'unknown'"
            :model-name="result.modelName || 'unknown'"
            :task-type="result.source"
            @submitted="showFeedback = false"
          />
        </div>
      </Transition>
    </div>
  </Transition>
</template>
