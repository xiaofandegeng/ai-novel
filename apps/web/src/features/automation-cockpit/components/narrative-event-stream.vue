<script setup lang="ts">
import type { CockpitNarrativeEvent } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { AlertTriangle, CheckCircle2, Clock, GitPullRequest, HelpCircle, XCircle } from 'lucide-vue-next'

defineProps<{
  events: CockpitNarrativeEvent[]
}>()

const emit = defineEmits<{
  (e: 'approve', eventId: string, changeSetId: string): void
  (e: 'reject', eventId: string, changeSetId: string): void
}>()

function getEventStatusInfo(status: string) {
  switch (status) {
    case 'auto_applied':
      return { text: '已自动应用', class: 'status-applied', icon: CheckCircle2 }
    case 'approved':
      return { text: '已采纳同步', class: 'status-applied', icon: CheckCircle2 }
    case 'pending_review':
      return { text: '待人工审阅', class: 'status-pending', icon: Clock }
    case 'isolated':
      return { text: '低置信度隔离', class: 'status-isolated', icon: HelpCircle }
    case 'failed':
      return { text: '写回失败', class: 'status-failed', icon: AlertTriangle }
    case 'ignored':
      return { text: '已忽略', class: 'status-ignored', icon: XCircle }
    default:
      return { text: status, class: 'status-default', icon: Clock }
  }
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  catch {
    return dateStr
  }
}
</script>

<template>
  <div class="narrative-event-stream">
    <div class="stream-header">
      <GitPullRequest :size="16" class="header-icon" />
      <span class="header-title">剧情实体写回与同步事件流</span>
    </div>

    <div v-if="!events.length" class="empty-state">
      <GitPullRequest :size="24" class="empty-icon" />
      <p>暂无写回事件。AI自动写作过程中抽取出的角色、矛盾等变更集在此汇总。</p>
    </div>

    <div v-else class="events-scroll-container">
      <div class="events-timeline">
        <div
          v-for="ev in events"
          :key="ev.id"
          class="event-card-wrapper"
          :class="`card-${ev.status}`"
        >
          <!-- 时间轴小圆点和竖线 -->
          <div class="timeline-axis">
            <div class="axis-dot" />
            <div class="axis-line" />
          </div>

          <!-- 卡片主体 -->
          <div class="event-card">
            <!-- 头部 -->
            <div class="card-header">
              <div class="header-left">
                <span class="event-type-badge">{{ ev.title }}</span>
                <span class="event-time">{{ formatDate(ev.createdAt) }}</span>
                <span v-if="ev.sourceChapterId" class="event-chapter">第 {{ ev.sourceChapterId }} 章</span>
              </div>

              <div class="header-right">
                <span v-if="ev.confidence" class="confidence-badge">置信度: {{ ev.confidence }}%</span>
                <span class="status-label" :class="getEventStatusInfo(ev.status).class">
                  <component :is="getEventStatusInfo(ev.status).icon" :size="12" />
                  {{ getEventStatusInfo(ev.status).text }}
                </span>
              </div>
            </div>

            <!-- 详情概要 -->
            <p class="card-summary">
              {{ ev.summary }}
            </p>

            <!-- 操作按钮 (中低置信度隔离可见) -->
            <div
              v-if="(ev.status === 'pending_review' || ev.status === 'isolated') && ev.changeSetId"
              class="card-actions"
            >
              <NButton
                variant="primary"
                size="sm"
                class="action-btn btn-approve"
                @click="emit('approve', ev.id, ev.changeSetId!)"
              >
                采纳同步
              </NButton>
              <NButton
                variant="secondary"
                size="sm"
                class="action-btn btn-reject"
                @click="emit('reject', ev.id, ev.changeSetId!)"
              >
                驳回丢弃
              </NButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.narrative-event-stream {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  .stream-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border-light, #e5e7eb);
    background-color: var(--bg-subtle, #f9fafb);

    .header-icon {
      color: var(--primary, #3b82f6);
    }

    .header-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary, #111827);
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--text-muted, #9ca3af);
    flex: 1;

    .empty-icon {
      margin-bottom: 0.5rem;
      opacity: 0.6;
    }

    p {
      font-size: 0.8125rem;
      margin: 0;
    }
  }

  .events-scroll-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .events-timeline {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    position: relative;
    padding-left: 1.25rem;
  }

  .event-card-wrapper {
    display: flex;
    position: relative;

    .timeline-axis {
      position: absolute;
      left: -1.25rem;
      top: 0;
      bottom: 0;
      width: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;

      .axis-dot {
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background-color: var(--text-muted, #d1d5db);
        margin-top: 0.625rem;
        z-index: 2;
        transition: background-color 0.2s ease;
      }

      .axis-line {
        position: absolute;
        top: 0.625rem;
        bottom: -1rem;
        width: 1px;
        background-color: var(--border-light, #e5e7eb);
        z-index: 1;
      }
    }

    &:last-child {
      .timeline-axis .axis-line {
        display: none;
      }
    }

    /* 根据状态渲染不同的轴点颜色 */
    &.card-auto_applied,
    &.card-approved {
      .timeline-axis .axis-dot {
        background-color: var(--success, #10b981);
      }
      .event-card {
        border-left-color: var(--success, #10b981);
      }
    }
    &.card-pending_review,
    &.card-isolated {
      .timeline-axis .axis-dot {
        background-color: var(--warning, #f59e0b);
      }
      .event-card {
        border-left-color: var(--warning, #f59e0b);
        background-color: var(--warning-soft, #fffbeb);
      }
    }
    &.card-failed {
      .timeline-axis .axis-dot {
        background-color: var(--danger, #ef4444);
      }
      .event-card {
        border-left-color: var(--danger, #ef4444);
      }
    }
    &.card-ignored {
      .timeline-axis .axis-dot {
        background-color: var(--text-muted, #9ca3af);
      }
      .event-card {
        border-left-color: var(--border-light, #e5e7eb);
        opacity: 0.6;
      }
    }

    .event-card {
      flex: 1;
      background-color: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-light, #e5e7eb);
      border-left: 3px solid var(--text-muted, #9ca3af);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;

        .header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;

          .event-type-badge {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-primary, #111827);
          }

          .event-time {
            font-size: 0.6875rem;
            color: var(--text-muted, #9ca3af);
          }

          .event-chapter {
            font-size: 0.6875rem;
            background-color: var(--bg-subtle, #f3f4f6);
            color: var(--text-secondary, #4b5563);
            padding: 0.0625rem 0.25rem;
            border-radius: 0.25rem;
          }
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;

          .confidence-badge {
            font-size: 0.6875rem;
            color: var(--text-muted, #6b7280);
          }

          .status-label {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.75rem;
            font-weight: 500;

            &.status-applied {
              color: var(--success, #10b981);
            }
            &.status-pending,
            &.status-isolated {
              color: var(--warning-dark, #d97706);
            }
            &.status-failed {
              color: var(--danger, #ef4444);
            }
            &.status-ignored {
              color: var(--text-muted, #9ca3af);
            }
          }
        }
      }

      .card-summary {
        font-size: 0.8125rem;
        color: var(--text-secondary, #4b5563);
        margin: 0;
        line-height: 1.4;
      }

      .card-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.25rem;

        .action-btn {
          font-size: 0.75rem;
          padding: 0.25rem 0.625rem;
          height: auto;
          line-height: 1.2;
        }

        .btn-approve {
          background-color: var(--success, #10b981);
          color: #ffffff;
          border-color: var(--success, #10b981);

          &:hover {
            background-color: var(--success-dark, #059669);
          }
        }

        .btn-reject {
          color: var(--text-secondary, #4b5563);
          border-color: var(--border-light, #e5e7eb);

          &:hover {
            background-color: var(--bg-subtle, #f3f4f6);
          }
        }
      }
    }
  }
}
</style>
