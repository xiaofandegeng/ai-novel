<script setup lang="ts">
import type { CockpitRelationshipState } from '@ai-novel/shared'
import { AlertTriangle, Heart, Shield, Users } from 'lucide-vue-next'

defineProps<{
  relationships: CockpitRelationshipState[]
}>()

// 获取亲密度、信任度、冲突度的百分比和样式
function getValueStyle(value: number | null | undefined, type: 'intimacy' | 'trust' | 'conflict') {
  if (value === null || value === undefined)
    return { width: '0%', backgroundColor: '#e5e7eb' }
  // 如果值在 0-10 之间，转化为 0-100 方便画进度条
  const val = value <= 10 ? value * 10 : value
  const percent = Math.min(100, Math.max(0, val))

  let color = 'var(--text-muted, #9ca3af)'
  if (type === 'intimacy') {
    color = 'var(--danger-soft, #fecdd3)' // 亲密度主色调为粉色/淡红
    if (percent > 40)
      color = 'var(--danger, #f43f5e)'
  }
  else if (type === 'trust') {
    color = 'var(--primary-soft, #bfdbfe)' // 信任度为蓝色
    if (percent > 40)
      color = 'var(--primary, #3b82f6)'
  }
  else if (type === 'conflict') {
    color = 'var(--warning-soft, #fef3c7)' // 冲突度为黄色/橙色
    if (percent > 40)
      color = 'var(--warning, #f59e0b)'
    if (percent > 75)
      color = 'var(--danger-dark, #be123c)'
  }

  return {
    width: `${percent}%`,
    backgroundColor: color,
  }
}

function formatValue(value: number | null | undefined) {
  if (value === null || value === undefined)
    return '-'
  return value
}
</script>

<template>
  <div class="relationship-dynamics-panel">
    <div v-if="!relationships.length" class="empty-state">
      <Users :size="32" class="empty-icon" />
      <p>暂无角色关系数据，大纲和章节中提取出关系网络后在此展示。</p>
    </div>

    <div v-else class="relationship-list">
      <div v-for="rel in relationships" :key="rel.id" class="relationship-card">
        <!-- 关系主体 -->
        <div class="card-header">
          <div class="characters-nodes">
            <span class="node-name">{{ rel.sourceName }}</span>
            <span class="node-connector">➔</span>
            <span class="node-name">{{ rel.targetName }}</span>
          </div>
          <span class="relation-type">{{ rel.type }}</span>
        </div>

        <!-- 互动数值指标 -->
        <div class="metrics-grid">
          <!-- 亲密度 -->
          <div class="metric-item">
            <div class="metric-header">
              <span class="metric-label">
                <Heart :size="12" class="icon-intimacy" />
                亲密度
              </span>
              <span class="metric-value">{{ formatValue(rel.intimacy) }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="getValueStyle(rel.intimacy, 'intimacy')" />
            </div>
          </div>

          <!-- 信任度 -->
          <div class="metric-item">
            <div class="metric-header">
              <span class="metric-label">
                <Shield :size="12" class="icon-trust" />
                信任度
              </span>
              <span class="metric-value">{{ formatValue(rel.trust) }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="getValueStyle(rel.trust, 'trust')" />
            </div>
          </div>

          <!-- 冲突度 -->
          <div class="metric-item">
            <div class="metric-header">
              <span class="metric-label">
                <AlertTriangle :size="12" class="icon-conflict" />
                冲突度
              </span>
              <span class="metric-value">{{ formatValue(rel.conflict) }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="getValueStyle(rel.conflict, 'conflict')" />
            </div>
          </div>
        </div>

        <!-- 发展动态与描述 -->
        <div v-if="rel.recentChange" class="recent-change-box">
          <div class="change-title">
            最新演变
          </div>
          <p class="change-desc">
            {{ rel.recentChange }}
          </p>
        </div>

        <!-- 变动章节 -->
        <div v-if="rel.lastChangedChapterId" class="card-footer">
          <span class="change-tag">最近在第 {{ rel.lastChangedChapterId }} 章发生关系更迭</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.relationship-dynamics-panel {
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

  .relationship-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .relationship-card {
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
      align-items: center;
      border-bottom: 1px dashed var(--border-light, #f3f4f6);
      padding-bottom: 0.75rem;
      margin-bottom: 0.75rem;

      .characters-nodes {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;

        .node-name {
          font-size: 0.9375rem;
          color: var(--text-primary, #111827);
        }

        .node-connector {
          color: var(--text-muted, #9ca3af);
          font-size: 0.875rem;
        }
      }

      .relation-type {
        font-size: 0.75rem;
        color: var(--purple, #8b5cf6);
        background-color: var(--purple-soft, #f5f3ff);
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-weight: 500;
      }
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 0.75rem;

      .metric-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;

          .metric-label {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            color: var(--text-muted, #6b7280);

            .icon-intimacy {
              color: var(--danger, #ef4444);
            }
            .icon-trust {
              color: var(--primary, #3b82f6);
            }
            .icon-conflict {
              color: var(--warning, #f59e0b);
            }
          }

          .metric-value {
            font-weight: 600;
            color: var(--text-secondary, #4b5563);
          }
        }

        .progress-bar {
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

    .recent-change-box {
      background-color: var(--bg-subtle, #f9fafb);
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      border-left: 3px solid var(--purple, #8b5cf6);

      .change-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-primary, #374151);
        margin-bottom: 0.25rem;
      }

      .change-desc {
        font-size: 0.8125rem;
        color: var(--text-secondary, #4b5563);
        margin: 0;
        line-height: 1.4;
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
