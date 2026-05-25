<script setup lang="ts">
import type { CockpitPlotDirection } from '@ai-novel/shared'
import { AlertTriangle, ArrowRightCircle, Compass, LockKeyhole, Navigation, Target } from 'lucide-vue-next'

defineProps<{
  plotDirection: CockpitPlotDirection | null
}>()
</script>

<template>
  <div class="plot-direction-panel">
    <div v-if="!plotDirection || (!plotDirection.themeProgress && !plotDirection.nextChapterGoal && !plotDirection.suggestions?.length && !plotDirection.globalGuardrails?.length)" class="empty-state">
      <Compass :size="32" class="empty-icon" />
      <p>暂无走向提示。AI将随着写作流推进自动为您生成下一章大纲建议与冲突爆点。</p>
    </div>

    <div v-else class="direction-container">
      <!-- 主题进度 -->
      <div v-if="plotDirection.globalGuardrails?.length" class="direction-section">
        <div class="section-title">
          <LockKeyhole :size="16" class="icon-guard" />
          <span>全局剧情护栏</span>
        </div>
        <ul class="constraint-list">
          <li v-for="(item, index) in plotDirection.globalGuardrails" :key="`guard-${index}`">
            {{ item }}
          </li>
        </ul>
      </div>

      <div v-if="plotDirection.activeConstraints?.length" class="direction-section">
        <div class="section-title">
          <Target :size="16" class="icon-target" />
          <span>人物与关系不可越界</span>
        </div>
        <ul class="constraint-list compact">
          <li v-for="(item, index) in plotDirection.activeConstraints" :key="`constraint-${index}`">
            {{ item }}
          </li>
        </ul>
      </div>

      <div v-if="plotDirection.healthWarnings?.length" class="direction-section">
        <div class="section-title">
          <AlertTriangle :size="16" class="icon-warning" />
          <span>当前偏航预警</span>
        </div>
        <ul class="constraint-list warning">
          <li v-for="(item, index) in plotDirection.healthWarnings" :key="`warning-${index}`">
            {{ item }}
          </li>
        </ul>
      </div>

      <div v-if="plotDirection.themeProgress" class="direction-section">
        <div class="section-title">
          <Compass :size="16" class="icon-compass" />
          <span>小说主题与节奏线</span>
        </div>
        <div class="section-content text-box highlight-box">
          <p>{{ plotDirection.themeProgress }}</p>
        </div>
      </div>

      <!-- 下一章目标 -->
      <div v-if="plotDirection.nextChapterGoal" class="direction-section">
        <div class="section-title">
          <Target :size="16" class="icon-target" />
          <span>下一章预设核心目标</span>
        </div>
        <div class="section-content text-box">
          <p class="text-primary font-medium">
            {{ plotDirection.nextChapterGoal }}
          </p>
        </div>
      </div>

      <!-- 下一章核心事件 -->
      <div v-if="plotDirection.nextChapterEvents" class="direction-section">
        <div class="section-title">
          <Navigation :size="16" class="icon-nav" />
          <span>推荐事件/核心冲突</span>
        </div>
        <div class="section-content text-box">
          <p>{{ plotDirection.nextChapterEvents }}</p>
        </div>
      </div>

      <!-- 走向建议列表 -->
      <div v-if="plotDirection.suggestions && plotDirection.suggestions.length" class="direction-section">
        <div class="section-title">
          <ArrowRightCircle :size="16" class="icon-suggest" />
          <span>AI 叙事变局与伏笔回收建议</span>
        </div>
        <ul class="suggestion-list">
          <li v-for="(sug, index) in plotDirection.suggestions" :key="index" class="suggestion-item">
            <span class="bullet-number">{{ index + 1 }}</span>
            <span class="bullet-text">{{ sug }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.plot-direction-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 1rem;

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    text-align: center;
    color: var(--text-muted, #9ca3af);

    .empty-icon {
      margin-bottom: 0.75rem;
      opacity: 0.6;
      color: var(--primary-soft, #eff6ff);
    }

    p {
      font-size: 0.875rem;
      margin: 0;
    }
  }

  .direction-container {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .direction-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .section-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary, #111827);

      .icon-compass {
        color: var(--purple, #8b5cf6);
      }
      .icon-target {
        color: var(--danger, #ef4444);
      }
      .icon-nav {
        color: var(--primary, #3b82f6);
      }
      .icon-suggest {
        color: var(--success, #10b981);
      }
      .icon-guard {
        color: var(--primary, #0f766e);
      }
      .icon-warning {
        color: var(--warning, #f59e0b);
      }
    }

    .section-content {
      font-size: 0.8125rem;
      color: var(--text-secondary, #4b5563);
      line-height: 1.5;
    }

    .text-box {
      background-color: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-light, #e5e7eb);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);

      p {
        margin: 0;
      }

      &.highlight-box {
        border-left: 4px solid var(--purple, #8b5cf6);
        background-color: var(--purple-soft, #f5f3ff);
      }

      .text-primary {
        color: var(--primary, #3b82f6);
      }

      .font-medium {
        font-weight: 500;
      }
    }

    .suggestion-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .suggestion-item {
        display: flex;
        gap: 0.75rem;
        background-color: var(--bg-surface, #ffffff);
        border: 1px solid var(--border-light, #e5e7eb);
        padding: 0.75rem;
        border-radius: 0.5rem;
        align-items: flex-start;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
        transition:
          transform 0.2s ease,
          border-color 0.2s ease;

        &:hover {
          transform: translateX(4px);
          border-color: var(--success-soft, #a7f3d0);
        }

        .bullet-number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.25rem;
          height: 1.25rem;
          border-radius: 9999px;
          background-color: var(--success-soft, #d1fae5);
          color: var(--success, #10b981);
          font-size: 0.75rem;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 0.125rem;
        }

        .bullet-text {
          font-size: 0.8125rem;
          color: var(--text-secondary, #4b5563);
          line-height: 1.4;
        }
      }
    }

    .constraint-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0;
      padding: 0;

      li {
        border: 1px solid var(--border-light, #e5e7eb);
        border-left: 4px solid var(--primary, #0f766e);
        border-radius: 0.5rem;
        background-color: var(--bg-surface, #ffffff);
        padding: 0.625rem 0.75rem;
        color: var(--text-secondary, #4b5563);
        font-size: 0.8125rem;
        line-height: 1.45;
      }

      &.compact li {
        border-left-color: var(--purple, #8b5cf6);
      }

      &.warning li {
        border-left-color: var(--warning, #f59e0b);
        background-color: var(--warning-soft, #fffbeb);
      }
    }
  }
}
</style>
