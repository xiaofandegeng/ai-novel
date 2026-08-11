<script setup lang="ts">
import type { CockpitRunSummary, CreateAutonomousRunInput } from '@ai-novel/shared'
import { NButton, NInput, NSelect } from '@ai-novel/ui'
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  StopCircle,
  Zap,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

const props = defineProps<{
  run: CockpitRunSummary | null
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'start', input: CreateAutonomousRunInput): void
  (e: 'pause'): void
  (e: 'resume'): void
  (e: 'abandon'): void
}>()

// 表单状态
const strategy = ref<'safe' | 'balanced' | 'fast'>('balanced')
const scopeType = ref<'next_n_chapters' | 'continue_incomplete'>('continue_incomplete')
const targetChapterCount = ref<string>('2')
const targetWordsPerChapter = ref<string>('3000')

// 策略选项
const strategyOptions = [
  { value: 'safe', label: '稳健策略 (高一致性/慢速)' },
  { value: 'balanced', label: '平衡策略 (适中/推荐)' },
  { value: 'fast', label: '高速策略 (快速产出/略过细检)' },
]

// 推进范围
const scopeOptions = [
  { value: 'continue_incomplete', label: '继续推进后续未开始章节' },
  { value: 'next_n_chapters', label: '自动推进后续 N 章' },
]

const isActive = computed(() => {
  if (!props.run)
    return false
  return ['running', 'paused', 'waiting_review'].includes(props.run.status)
})

const progressPercent = computed(() => {
  if (!props.run || !props.run.targetChapterCount)
    return 0
  return Math.min(100, Math.round((props.run.completedChapterCount / props.run.targetChapterCount) * 100))
})

const statusLabel = computed(() => {
  if (!props.run)
    return '空闲'
  switch (props.run.status) {
    case 'running': return '正在全自动写作中'
    case 'paused': return '任务已暂停'
    case 'waiting_review': return '等待人工确认/自动修复中'
    case 'completed': return '本次任务已完成'
    case 'failed': return '任务运行失败'
    case 'abandoned': return '任务已被放弃'
    default: return props.run.status
  }
})

const statusClass = computed(() => {
  if (!props.run)
    return 'status-idle'
  return `status-${props.run.status}`
})

function handleStart() {
  const input: CreateAutonomousRunInput = {
    strategy: strategy.value,
    scopeType: scopeType.value,
    targetWordsPerChapter: Number(targetWordsPerChapter.value) || 3000,
  }
  if (scopeType.value === 'next_n_chapters') {
    input.targetChapterCount = Number(targetChapterCount.value) || 2
  }
  emit('start', input)
}
</script>

<template>
  <div class="automation-control-panel border rounded-xl bg-surface p-5 shadow-sm">
    <div class="panel-header mb-4">
      <div class="icon-wrap">
        <Zap :size="18" />
      </div>
      <h2 class="panel-title">
        自动驾驶控制台
      </h2>
    </div>

    <!-- 活跃运行中的状态看板 -->
    <div v-if="isActive && run" class="active-run-view space-y-4">
      <div class="status-banner" :class="statusClass">
        <div class="flex items-center gap-2">
          <Loader2 v-if="run.status === 'running'" class="animate-spin text-primary" :size="16" />
          <AlertCircle v-else-if="run.status === 'failed' || run.status === 'waiting_review'" :size="16" />
          <CheckCircle v-else :size="16" />
          <span class="text-sm font-bold">{{ statusLabel }}</span>
        </div>
        <span class="strategy-badge text-[10px]">{{ run.strategy === 'safe' ? '稳健' : run.strategy === 'fast' ? '高速' : '平衡' }}</span>
      </div>

      <div class="progress-section">
        <div class="mb-1 flex justify-between text-xs text-text-secondary">
          <span>章节进度</span>
          <span>已推进 {{ run.completedChapterCount }} / {{ run.targetChapterCount }} 章</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
      </div>

      <div class="flex flex-col gap-2 pt-2">
        <div v-if="run.status === 'running'" class="flex gap-2">
          <NButton class="flex-1" variant="secondary" :disabled="loading" @click="emit('pause')">
            <Pause :size="15" /> 暂停运行
          </NButton>
        </div>
        <div v-else-if="run.status === 'paused'" class="flex gap-2">
          <NButton class="flex-1" variant="primary" :disabled="loading" @click="emit('resume')">
            <Play :size="15" /> 继续推进
          </NButton>
        </div>
        <NButton class="w-full" variant="danger" :disabled="loading" @click="emit('abandon')">
          <StopCircle :size="15" /> 放弃本次任务
        </NButton>
      </div>
    </div>

    <!-- 未运行任务时的 Launcher 控制 -->
    <div v-else class="run-launcher-view space-y-4">
      <div v-if="run" class="last-run-summary border rounded-lg bg-bg-subtle p-3 text-xs space-y-1">
        <div class="text-text-muted">
          上次任务状态:
        </div>
        <div class="flex items-center justify-between font-medium">
          <span :class="run.status === 'completed' ? 'text-green' : 'text-red'">{{ statusLabel }}</span>
          <span>完成 {{ run.completedChapterCount }} 章</span>
        </div>
      </div>

      <div class="form-item">
        <NSelect
          v-model="strategy"
          label="推进策略"
          :options="strategyOptions"
        />
      </div>

      <div class="form-item">
        <NSelect
          v-model="scopeType"
          label="推进范围"
          :options="scopeOptions"
        />
      </div>

      <div v-if="scopeType === 'next_n_chapters'" class="form-item">
        <NInput
          v-model="targetChapterCount"
          label="推进章节数"
          type="number"
          :min="1"
          :max="10"
          placeholder="推进章节数"
        />
      </div>

      <div class="form-item">
        <NInput
          v-model="targetWordsPerChapter"
          label="每章字数目标"
          type="number"
          :min="1000"
          :max="10000"
          :step="500"
          placeholder="输入每章字数"
        />
      </div>

      <NButton
        class="start-btn w-full"
        variant="primary"
        :disabled="loading"
        @click="handleStart"
      >
        <Play :size="15" /> 开启全自动写作任务
        <ChevronRight :size="14" class="ml-1" />
      </NButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.automation-control-panel {
  background-color: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-light, #e5e7eb);

  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 0.375rem;
      background-color: var(--primary-soft, #eff6ff);
      color: var(--primary, #3b82f6);
    }

    .panel-title {
      font-size: 0.875rem;
      font-weight: 700;
      color: var(--text-primary, #111827);
      margin: 0;
    }
  }

  .status-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;

    &.status-running {
      background-color: var(--primary-soft, #eff6ff);
      color: var(--primary, #2563eb);
    }

    &.status-paused {
      background-color: #fef3c7;
      color: #d97706;
    }

    &.status-waiting_review {
      background-color: #fef3c7;
      color: #d97706;
      border: 1px dashed #fbbf24;
    }

    &.status-completed {
      background-color: #d1fae5;
      color: #059669;
    }

    &.status-failed {
      background-color: #fee2e2;
      color: #dc2626;
    }

    &.status-abandoned {
      background-color: var(--bg-subtle, #f3f4f6);
      color: var(--text-secondary, #4b5563);
    }

    .strategy-badge {
      background-color: rgba(255, 255, 255, 0.6);
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-weight: 600;
    }
  }

  .progress-section {
    .bar-bg {
      height: 8px;
      background-color: var(--bg-subtle, #f3f4f6);
      border-radius: 9999px;
      overflow: hidden;

      .bar-fill {
        height: 100%;
        background-color: var(--primary, #3b82f6);
        border-radius: 9999px;
        transition: width 0.3s ease;
      }
    }
  }

  .form-item {
    display: flex;
    flex-direction: column;

    .form-label {
      color: var(--text-secondary, #4b5563);
    }
  }

  .start-btn {
    display: flex;
    justify-content: center;
    align-items: center;
    background: linear-gradient(135deg, var(--primary, #3b82f6), #1d4ed8);
    font-weight: 600;
    box-shadow:
      0 4px 6px -1px rgba(59, 130, 246, 0.1),
      0 2px 4px -1px rgba(59, 130, 246, 0.06);

    &:hover {
      background: linear-gradient(135deg, #2563eb, #1e40af);
    }
  }

  .last-run-summary {
    border-left: 3px solid var(--border-light, #e5e7eb);
  }
}

.text-green {
  color: #059669;
}
.text-red {
  color: #dc2626;
}
</style>
