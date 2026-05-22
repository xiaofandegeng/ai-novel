<script setup lang="ts">
import type { CockpitChapterProgress } from '@ai-novel/shared'
import { NButton, NTag } from '@ai-novel/ui'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  XCircle,
} from 'lucide-vue-next'
import { ref } from 'vue'

defineProps<{
  chapters: CockpitChapterProgress[]
  activeChapterId?: string
}>()

const emit = defineEmits<{
  (e: 'chapterClick', id: string): void
}>()

// 展开/收起章节流水线的状态 map
const expandedChapters = ref<Record<string, boolean>>({})

function toggleExpand(chapterId: string) {
  expandedChapters.value[chapterId] = !expandedChapters.value[chapterId]
}

function getStepIcon(status: string) {
  switch (status) {
    case 'completed': return CheckCircle2
    case 'failed': return XCircle
    case 'running': return Clock
    case 'blocked': return AlertCircle
    default: return Clock
  }
}

function getStepClass(status: string) {
  return `step-status-${status}`
}

function getChapterStatusTag(status: string) {
  switch (status) {
    case 'completed': return { type: 'success', text: '已写完' }
    case 'running': return { type: 'primary', text: '推进中' }
    case 'failed': return { type: 'danger', text: '推进失败' }
    case 'isolated': return { type: 'warning', text: '已隔离' }
    case 'skipped': return { type: 'info', text: '已略过' }
    default: return { type: 'secondary', text: '待推进' }
  }
}
</script>

<template>
  <div class="chapter-pipeline-panel space-y-4">
    <div class="panel-title-bar">
      <div class="flex items-center gap-2">
        <BookOpen :size="18" class="text-primary" />
        <h2 class="text-sm text-text-primary font-bold">
          章节推进流水线
        </h2>
      </div>
      <span class="text-xs text-text-muted">共 {{ chapters.length }} 章</span>
    </div>

    <div class="chapters-list space-y-3">
      <div
        v-for="ch in chapters"
        :key="ch.id"
        class="chapter-card overflow-hidden border rounded-xl bg-surface"
        :class="{ 'active-border': activeChapterId === ch.id }"
      >
        <!-- 章节概要条 -->
        <div
          class="chapter-card-header flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-bg-subtle/50"
          @click="toggleExpand(ch.id)"
        >
          <div class="flex items-center gap-3">
            <span class="expand-icon text-text-muted">
              <ChevronDown v-if="expandedChapters[ch.id]" :size="16" />
              <ChevronRight v-else :size="16" />
            </span>
            <div class="chapter-meta">
              <span class="chapter-number text-xs text-primary font-bold">第 {{ ch.orderIndex }} 章</span>
              <h3 class="chapter-title mt-0.5 text-sm text-text-primary font-bold">
                {{ ch.title }}
              </h3>
            </div>
          </div>

          <div class="flex items-center gap-3" @click.stop>
            <span v-if="ch.wordCount" class="text-xs text-text-muted">{{ ch.wordCount }} 字</span>
            <NTag
              :variant="getChapterStatusTag(ch.status).type as any"
              size="sm"
            >
              {{ getChapterStatusTag(ch.status).text }}
            </NTag>
            <NButton
              variant="secondary"
              size="sm"
              class="detail-btn"
              @click="emit('chapterClick', ch.id)"
            >
              <FileText :size="13" />
              详情
            </NButton>
          </div>
        </div>

        <!-- 推进步骤图 -->
        <div
          v-if="expandedChapters[ch.id]"
          class="chapter-card-body border-t bg-bg-subtle/30 px-6 py-4"
        >
          <div v-if="ch.steps && ch.steps.length > 0" class="steps-timeline space-y-3">
            <div
              v-for="step in ch.steps"
              :key="step.key"
              class="step-item flex items-start gap-3"
              :class="getStepClass(step.status)"
            >
              <div class="step-indicator">
                <component
                  :is="getStepIcon(step.status)"
                  :size="16"
                  :class="{ 'spinning': step.status === 'running', 'text-green': step.status === 'completed', 'text-red': step.status === 'failed', 'text-yellow': step.status === 'blocked', 'text-gray': step.status === 'pending' }"
                />
              </div>
              <div class="step-content flex-1">
                <div class="flex items-center justify-between">
                  <span class="step-label text-xs font-medium">{{ step.label }}</span>
                  <span v-if="step.finishedAt" class="step-time text-[10px] text-text-muted">
                    已完成
                  </span>
                  <span v-else-if="step.status === 'running'" class="step-time running-pulse text-[10px] text-primary">
                    推进中...
                  </span>
                </div>
                <p v-if="step.error" class="step-error bg-red-soft mt-1 border border-red/10 rounded p-2 text-[11px] text-red">
                  {{ step.error }}
                </p>
              </div>
            </div>
          </div>
          <div v-else class="empty-steps py-2 text-center text-xs text-text-muted">
            暂无步骤记录（该章节处于队列等待中或尚未纳入当前任务推进）
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chapter-pipeline-panel {
  .panel-title-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-light, #e5e7eb);
  }

  .chapters-list {
    .chapter-card {
      background-color: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-light, #e5e7eb);
      transition: all 0.2s ease;

      &.active-border {
        border-color: var(--primary, #3b82f6);
        box-shadow: 0 0 0 1px var(--primary, #3b82f6);
      }

      &:hover {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }

      .chapter-card-header {
        .chapter-number {
          letter-spacing: 0.025em;
        }

        .detail-btn {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
      }

      .chapter-card-body {
        border-color: var(--border-light, #e5e7eb);
      }
    }
  }

  .steps-timeline {
    position: relative;
    padding-left: 0.5rem;

    &::before {
      content: '';
      position: absolute;
      left: 15px;
      top: 10px;
      bottom: 10px;
      width: 2px;
      background-color: var(--border-light, #e5e7eb);
      z-index: 0;
    }

    .step-item {
      position: relative;
      z-index: 1;

      .step-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: var(--bg-surface, #ffffff);
      }

      .step-label {
        color: var(--text-primary, #111827);
      }

      &.step-status-pending {
        .step-label {
          color: var(--text-muted, #9ca3af);
        }
      }

      &.step-status-running {
        .step-label {
          color: var(--primary, #3b82f6);
          font-weight: 600;
        }
      }

      &.step-status-failed {
        .step-label {
          color: var(--danger, #ef4444);
          font-weight: 600;
        }
      }
    }
  }
}

.text-green {
  color: #10b981;
}
.text-red {
  color: #ef4444;
}
.text-yellow {
  color: #f59e0b;
}
.text-gray {
  color: #9ca3af;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.running-pulse {
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.bg-red-soft {
  background-color: #fef2f2;
}
.border-red\/10 {
  border-color: rgba(239, 68, 68, 0.1);
}
</style>
