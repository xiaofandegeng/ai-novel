<script setup lang="ts">
import type { CockpitProjectSummary } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { BookOpen, RefreshCw } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  project: CockpitProjectSummary | null
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const targetText = computed(() => {
  if (!props.project?.targetWordCount)
    return '未设定'
  return `${(props.project.targetWordCount / 10000).toFixed(1)} 万字`
})

const currentText = computed(() => {
  if (!props.project?.currentWordCount)
    return '0 字'
  return `${props.project.currentWordCount.toLocaleString()} 字`
})

const progressPercent = computed(() => {
  if (!props.project?.targetWordCount || !props.project?.currentWordCount)
    return 0
  return Math.min(100, Math.round((props.project.currentWordCount / props.project.targetWordCount) * 100))
})
</script>

<template>
  <header class="cockpit-header">
    <div class="header-left">
      <div class="project-icon">
        <BookOpen :size="20" />
      </div>
      <div v-if="project" class="project-info">
        <h1 class="project-title">
          {{ project.title }}
        </h1>
        <div class="project-meta">
          <span v-if="project.genre" class="meta-tag">类型: {{ project.genre }}</span>
          <span v-if="project.theme" class="meta-tag">题材: {{ project.theme }}</span>
        </div>
      </div>
      <div v-else class="project-info loading-info">
        <div class="skeleton title-skeleton" />
        <div class="skeleton meta-skeleton" />
      </div>
    </div>

    <div v-if="project" class="header-right">
      <div class="word-progress">
        <div class="progress-labels">
          <span class="label-current">当前: <strong>{{ currentText }}</strong></span>
          <span class="label-target">目标: {{ targetText }}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }" />
          <span class="progress-percent-text">{{ progressPercent }}%</span>
        </div>
      </div>
      <NButton class="refresh-btn" variant="secondary" :disabled="loading" @click="emit('refresh')">
        <RefreshCw :class="{ spinning: loading }" :size="16" />
        刷新
      </NButton>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.cockpit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  background-color: var(--bg-surface, #ffffff);
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;

    .project-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.5rem;
      background-color: var(--primary-soft, #eff6ff);
      color: var(--primary, #3b82f6);
    }

    .project-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary, #111827);
      margin: 0;
      line-height: 1.2;
    }

    .project-meta {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.25rem;

      .meta-tag {
        font-size: 0.75rem;
        color: var(--text-muted, #6b7280);
        background-color: var(--bg-subtle, #f3f4f6);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
      }
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1.5rem;

    .word-progress {
      width: 220px;

      .progress-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--text-secondary, #4b5563);
        margin-bottom: 0.375rem;

        strong {
          color: var(--text-primary, #111827);
        }
      }

      .progress-bar-container {
        position: relative;
        height: 12px;
        background-color: var(--bg-subtle, #f3f4f6);
        border-radius: 9999px;
        overflow: hidden;

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary, #3b82f6), var(--primary-hover, #2563eb));
          border-radius: 9999px;
          transition: width 0.4s ease;
        }

        .progress-percent-text {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 9px;
          font-weight: 700;
          color: var(--text-primary, #111827);
          line-height: 1;
        }
      }
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  }
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

.skeleton {
  background-color: var(--bg-subtle, #f3f4f6);
  border-radius: 0.25rem;
  animation: pulse 1.5s infinite ease-in-out;
}

.title-skeleton {
  width: 150px;
  height: 1.25rem;
}

.meta-skeleton {
  width: 100px;
  height: 0.75rem;
  margin-top: 0.375rem;
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
</style>
