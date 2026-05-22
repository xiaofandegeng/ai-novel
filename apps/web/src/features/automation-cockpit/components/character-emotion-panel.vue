<script setup lang="ts">
import type { CockpitCharacterState } from '@ai-novel/shared'
import { AlertTriangle, Heart, Key, Sparkles, Target, User } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  characters: CockpitCharacterState[]
}>()

const sortedCharacters = computed(() => {
  return [...props.characters].sort((a, b) => {
    // 主角排在前面
    const aRole = (a.role || '').toLowerCase()
    const bRole = (b.role || '').toLowerCase()
    if (aRole.includes('protagonist') || aRole.includes('主角'))
      return -1
    if (bRole.includes('protagonist') || bRole.includes('主角'))
      return 1
    return (b.confidence || 0) - (a.confidence || 0)
  })
})

function getConfidenceStyle(confidence: number | null | undefined) {
  if (!confidence)
    return { width: '0%', backgroundColor: 'var(--text-muted)' }
  const percent = confidence * 100
  let color = 'var(--success, #10b981)'
  if (confidence < 0.4)
    color = 'var(--danger, #ef4444)'
  else if (confidence < 0.7)
    color = 'var(--warning, #f59e0b)'
  return {
    width: `${percent}%`,
    backgroundColor: color,
  }
}
</script>

<template>
  <div class="character-emotion-panel">
    <div v-if="!sortedCharacters.length" class="empty-state">
      <User :size="32" class="empty-icon" />
      <p>暂无角色数据，将在大纲与自动写作开始后自动聚合。</p>
    </div>

    <div v-else class="character-list">
      <div v-for="char in sortedCharacters" :key="char.id" class="character-card">
        <!-- 头部信息 -->
        <div class="card-header">
          <div class="char-title">
            <span class="char-name">{{ char.name }}</span>
            <span v-if="char.role" class="char-role">{{ char.role }}</span>
          </div>
          <div v-if="char.confidence !== null && char.confidence !== undefined" class="confidence-indicator">
            <span class="label">置信度: {{ Math.round(char.confidence * 100) }}%</span>
            <div class="progress-bar">
              <div class="progress-fill" :style="getConfidenceStyle(char.confidence)" />
            </div>
          </div>
        </div>

        <!-- 详细状态 -->
        <div class="card-grid">
          <div v-if="char.emotion" class="grid-item">
            <div class="item-label">
              <Heart :size="14" class="icon-emotion" />
              <span>当前情绪</span>
            </div>
            <div class="item-value text-highlight">
              {{ char.emotion }}
            </div>
          </div>

          <div v-if="char.goal" class="grid-item full-width">
            <div class="item-label">
              <Target :size="14" class="icon-goal" />
              <span>当前目标</span>
            </div>
            <div class="item-value">
              {{ char.goal }}
            </div>
          </div>

          <div v-if="char.fear" class="grid-item">
            <div class="item-label">
              <AlertTriangle :size="14" class="icon-fear" />
              <span>内心恐惧</span>
            </div>
            <div class="item-value">
              {{ char.fear }}
            </div>
          </div>

          <div v-if="char.secret" class="grid-item">
            <div class="item-label">
              <Key :size="14" class="icon-secret" />
              <span>深埋秘密</span>
            </div>
            <div class="item-value">
              {{ char.secret }}
            </div>
          </div>

          <div v-if="char.weakness" class="grid-item">
            <div class="item-label">
              <Sparkles :size="14" class="icon-weakness" />
              <span>弱点/盲区</span>
            </div>
            <div class="item-value">
              {{ char.weakness }}
            </div>
          </div>

          <div v-if="char.relationshipPressure" class="grid-item full-width">
            <div class="item-label">
              <User :size="14" class="icon-pressure" />
              <span>人际矛盾/外部压力</span>
            </div>
            <div class="item-value">
              {{ char.relationshipPressure }}
            </div>
          </div>
        </div>

        <!-- 底部变动 -->
        <div v-if="char.lastChangedChapterId" class="card-footer">
          <span class="change-tag">最近在第 {{ char.lastChangedChapterId }} 章发生心境演变</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.character-emotion-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
  gap: 1rem;

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
    }

    p {
      font-size: 0.875rem;
      margin: 0;
    }
  }

  .character-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .character-card {
    background-color: var(--bg-surface, #ffffff);
    border: 1px solid var(--border-light, #f3f4f6);
    border-radius: 0.75rem;
    padding: 1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px dashed var(--border-light, #f3f4f6);
      padding-bottom: 0.75rem;
      margin-bottom: 0.75rem;

      .char-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .char-name {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .char-role {
          font-size: 0.75rem;
          color: var(--primary, #3b82f6);
          background-color: var(--primary-soft, #eff6ff);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-weight: 500;
        }
      }

      .confidence-indicator {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.25rem;

        .label {
          font-size: 0.75rem;
          color: var(--text-muted, #6b7280);
        }

        .progress-bar {
          width: 60px;
          height: 4px;
          background-color: var(--bg-subtle, #f3f4f6);
          border-radius: 9999px;
          overflow: hidden;

          .progress-fill {
            height: 100%;
            border-radius: 9999px;
            transition: width 0.3s ease;
          }
        }
      }
    }

    .card-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;

      .grid-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        &.full-width {
          grid-column: span 2;
        }

        .item-label {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          color: var(--text-muted, #6b7280);

          .icon-emotion {
            color: var(--danger, #ef4444);
          }
          .icon-goal {
            color: var(--primary, #3b82f6);
          }
          .icon-fear {
            color: var(--warning, #f59e0b);
          }
          .icon-secret {
            color: var(--purple, #8b5cf6);
          }
          .icon-weakness {
            color: var(--success, #10b981);
          }
          .icon-pressure {
            color: var(--warning-dark, #d97706);
          }
        }

        .item-value {
          font-size: 0.8125rem;
          color: var(--text-secondary, #4b5563);
          line-height: 1.4;
          background-color: var(--bg-subtle, #f9fafb);
          padding: 0.375rem 0.5rem;
          border-radius: 0.375rem;
          min-height: 1.5rem;

          &.text-highlight {
            font-weight: 500;
            color: var(--primary-dark, #1e40af);
            background-color: var(--primary-soft, #eff6ff);
          }
        }
      }
    }

    .card-footer {
      margin-top: 0.75rem;
      border-top: 1px solid var(--border-light, #f3f4f6);
      padding-top: 0.5rem;
      display: flex;
      justify-content: flex-end;

      .change-tag {
        font-size: 0.75rem;
        color: var(--text-muted, #9ca3af);
        font-style: italic;
      }
    }
  }
}
</style>
