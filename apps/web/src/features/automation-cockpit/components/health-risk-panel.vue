<script setup lang="ts">
import type { CockpitHealthRiskDetail, CockpitHealthSummary } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { Activity, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toErrorMessage } from '@/utils/error-message'
import { repairCockpitHealthRisk } from '../api/automation-cockpit.api'

defineProps<{
  health: CockpitHealthSummary | null
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const router = useRouter()
const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const repairingRiskKey = ref('')

function handleAction(routeStr: string) {
  if (routeStr) {
    router.push(routeStr)
  }
}

function getRiskKey(item: CockpitHealthRiskDetail) {
  return item.id || `${item.type || 'risk'}:${item.chapterId || item.description || 'unknown'}`
}

function canRepairRisk(item: CockpitHealthRiskDetail) {
  return !!projectId && !!item.chapterId && item.fixAction !== 'none'
}

async function handleRepairRisk(item: CockpitHealthRiskDetail) {
  if (!canRepairRisk(item))
    return

  const riskKey = getRiskKey(item)
  repairingRiskKey.value = riskKey
  try {
    toast.add('正在根据风险原因启动自动修复，请稍候...', 'info')
    const result = await repairCockpitHealthRisk(projectId, item)
    toast.add(result.message || '风险修复任务已启动。', 'success')
    emit('refresh')
  }
  catch (error: unknown) {
    console.error(error)
    toast.add(toErrorMessage(error, '风险修复失败，请稍后重试。'), 'error')
  }
  finally {
    repairingRiskKey.value = ''
  }
}

function getScoreColor(score: number) {
  if (score >= 85)
    return 'score-safe'
  if (score >= 70)
    return 'score-warn'
  return 'score-danger'
}

function getRiskLevelBadge(level: 'low' | 'medium' | 'high') {
  switch (level) {
    case 'high':
      return { text: '严重偏离/高危', class: 'level-high' }
    case 'medium':
      return { text: '中度预警', class: 'level-medium' }
    case 'low':
      return { text: '轻微偏差', class: 'level-low' }
    default:
      return { text: level, class: 'level-default' }
  }
}
</script>

<template>
  <div class="health-risk-panel">
    <div v-if="!health" class="empty-state">
      <Activity :size="32" class="empty-icon" />
      <p>暂无健康度数据，全自动写作启动后将实时开展大纲对齐性审查。</p>
    </div>

    <div v-else class="health-container">
      <!-- 总体评分环/面板 -->
      <div class="score-card" :class="getScoreColor(health.overallScore)">
        <div class="score-circle">
          <span class="score-num font-extrabold">{{ health.overallScore }}</span>
          <span class="score-label">健康指数</span>
        </div>
        <div class="score-summary">
          <div v-if="health.overallScore >= 85" class="summary-title">
            <CheckCircle :size="16" class="text-success" />
            <span>剧情状态极其稳定</span>
          </div>
          <div v-else-if="health.overallScore >= 70" class="summary-title">
            <AlertTriangle :size="16" class="text-warn" />
            <span>检测到轻度叙事偏差</span>
          </div>
          <div v-else class="summary-title">
            <ShieldAlert :size="16" class="text-danger" />
            <span>偏轨高危，急需人工审阅</span>
          </div>
          <p class="summary-desc">
            当前项目共扫描到 <strong>{{ health.riskCount }}</strong> 个一致性风险点。
          </p>
        </div>
      </div>

      <!-- 风险条目明细 -->
      <div class="risk-details-section">
        <h4 class="section-title">
          检测风险明细列表
        </h4>

        <div v-if="!health.details?.length" class="no-risk-box">
          <CheckCircle :size="24" class="success-icon" />
          <p>太棒了！当前未检测到任何人物崩坏、伏笔冲突或偏题风险。</p>
        </div>

        <div v-else class="risk-list">
          <div v-for="(item, index) in health.details" :key="index" class="risk-item-card" :class="`risk-card-${item.riskLevel}`">
            <div class="risk-header">
              <span class="risk-scope font-semibold">{{ item.scope }}</span>
              <span class="risk-level-badge" :class="getRiskLevelBadge(item.riskLevel).class">
                {{ getRiskLevelBadge(item.riskLevel).text }}
              </span>
            </div>
            <p v-if="item.description" class="risk-desc">
              {{ item.description }}
            </p>
            <div v-if="item.actionLabel || canRepairRisk(item) || item.targetRoute" class="risk-action-suggest">
              <div class="suggest-content">
                <span class="action-prefix font-semibold">建议方案：</span>
                <span class="action-text">{{ item.actionLabel || '根据风险定位自动执行章节修复，并刷新全局台账。' }}</span>
              </div>
              <div class="action-buttons-wrap">
                <button
                  v-if="canRepairRisk(item)"
                  class="action-repair-btn font-semibold"
                  :disabled="repairingRiskKey === getRiskKey(item)"
                  @click="handleRepairRisk(item)"
                >
                  {{ repairingRiskKey === getRiskKey(item) ? '修复中...' : (item.fixLabel || '一键修复') }}
                </button>
                <button
                  v-if="item.targetRoute"
                  class="action-go-btn font-semibold"
                  @click="handleAction(item.targetRoute)"
                >
                  一键直达
                </button>
              </div>
            </div>
            <div v-if="item.score !== undefined" class="risk-score-indicator">
              <span class="score-lbl">评估得分: {{ item.score }} / 100</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.health-risk-panel {
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

  .health-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .score-card {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-light, #e5e7eb);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);

    &.score-safe {
      background: linear-gradient(135deg, var(--success-soft, #f0fdf4) 0%, #ffffff 100%);
      border-color: var(--success-soft, #bcf0da);
      .score-circle {
        border-color: var(--success, #10b981);
        color: var(--success, #10b981);
      }
    }

    &.score-warn {
      background: linear-gradient(135deg, var(--warning-soft, #fefbeb) 0%, #ffffff 100%);
      border-color: var(--warning-soft, #fde68a);
      .score-circle {
        border-color: var(--warning, #f59e0b);
        color: var(--warning, #f59e0b);
      }
    }

    &.score-danger {
      background: linear-gradient(135deg, var(--danger-soft, #fef2f2) 0%, #ffffff 100%);
      border-color: var(--danger-soft, #fca5a5);
      .score-circle {
        border-color: var(--danger, #ef4444);
        color: var(--danger, #ef4444);
      }
    }

    .score-circle {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 70px;
      height: 70px;
      border: 4px solid;
      border-radius: 9999px;
      flex-shrink: 0;

      .score-num {
        font-size: 1.5rem;
        line-height: 1;
      }

      .score-label {
        font-size: 0.625rem;
        color: var(--text-muted, #6b7280);
        margin-top: 0.125rem;
      }
    }

    .score-summary {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      .summary-title {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.9375rem;
        font-weight: 600;

        .text-success {
          color: var(--success, #10b981);
        }
        .text-warn {
          color: var(--warning, #f59e0b);
        }
        .text-danger {
          color: var(--danger, #ef4444);
        }
      }

      .summary-desc {
        font-size: 0.8125rem;
        color: var(--text-secondary, #4b5563);
        margin: 0;

        strong {
          color: var(--text-primary, #111827);
        }
      }
    }
  }

  .risk-details-section {
    .section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary, #111827);
      margin: 0 0 0.75rem 0;
    }

    .no-risk-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: var(--success-soft, #f0fdf4);
      border: 1px solid var(--success-soft, #bcf0da);
      border-radius: 0.5rem;
      padding: 2rem 1rem;
      text-align: center;

      .success-icon {
        color: var(--success, #10b981);
        margin-bottom: 0.5rem;
      }

      p {
        font-size: 0.8125rem;
        color: var(--success-dark, #065f46);
        margin: 0;
      }
    }

    .risk-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .risk-item-card {
      background-color: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-light, #e5e7eb);
      border-left: 4px solid;
      border-radius: 0.5rem;
      padding: 0.75rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);

      &.risk-card-high {
        border-left-color: var(--danger, #ef4444);
        background: linear-gradient(90deg, var(--danger-soft, #fef2f2) 0%, #ffffff 10%);
      }

      &.risk-card-medium {
        border-left-color: var(--warning, #f59e0b);
        background: linear-gradient(90deg, var(--warning-soft, #fefbeb) 0%, #ffffff 10%);
      }

      &.risk-card-low {
        border-left-color: var(--primary, #3b82f6);
      }

      .risk-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.375rem;

        .risk-scope {
          font-size: 0.8125rem;
          color: var(--text-primary, #111827);
        }

        .risk-level-badge {
          font-size: 0.6875rem;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-weight: 600;

          &.level-high {
            background-color: var(--danger-soft, #fee2e2);
            color: var(--danger, #ef4444);
          }

          &.level-medium {
            background-color: var(--warning-soft, #fef3c7);
            color: var(--warning-dark, #d97706);
          }

          &.level-low {
            background-color: var(--primary-soft, #eff6ff);
            color: var(--primary, #3b82f6);
          }
        }
      }

      .risk-desc {
        font-size: 0.75rem;
        color: var(--text-secondary, #4b5563);
        margin: 0 0 0.5rem 0;
        line-height: 1.4;
      }

      .risk-action-suggest {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.75rem;
        background-color: var(--bg-subtle, #f9fafb);
        border: 1px dashed var(--border-light, #e5e7eb);
        border-radius: 0.375rem;
        padding: 0.375rem 0.5rem;
        margin: 0.25rem 0 0.5rem 0;
        color: var(--text-secondary, #4b5563);
        line-height: 1.4;

        .suggest-content {
          display: flex;
          align-items: flex-start;
          gap: 0.25rem;
        }

        .action-prefix {
          color: var(--primary, #3b82f6);
          white-space: nowrap;
        }

        .action-text {
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .action-buttons-wrap {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          flex-shrink: 0;
        }

        .action-repair-btn {
          background-color: var(--success, #10b981);
          color: #ffffff;
          border: none;
          border-radius: 0.25rem;
          padding: 0.125rem 0.5rem;
          font-size: 0.6875rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
          white-space: nowrap;
          flex-shrink: 0;

          &:hover:not(:disabled) {
            background-color: var(--success-dark, #059669);
          }

          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        }

        .action-go-btn {
          background-color: var(--primary, #3b82f6);
          color: #ffffff;
          border: none;
          border-radius: 0.25rem;
          padding: 0.125rem 0.5rem;
          font-size: 0.6875rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
          white-space: nowrap;
          flex-shrink: 0;

          &:hover {
            background-color: var(--primary-dark, #2563eb);
          }
        }
      }

      .risk-score-indicator {
        font-size: 0.6875rem;
        color: var(--text-muted, #9ca3af);
      }
    }
  }
}

.font-extrabold {
  font-weight: 800;
}
.font-semibold {
  font-weight: 600;
}
</style>
