<script setup lang="ts">
import type { CockpitForeshadowingState } from '@ai-novel/shared'
import { ArrowRight, Eye, User } from 'lucide-vue-next'

defineProps<{
  foreshadowing: CockpitForeshadowingState[]
}>()

function getStatusBadge(status: string) {
  switch (status) {
    case 'open':
      return { text: '已设伏笔', class: 'badge-open' }
    case 'progressing':
      return { text: '线索推进', class: 'badge-progressing' }
    case 'paid_off':
      return { text: '伏笔回收', class: 'badge-paidoff' }
    case 'abandoned':
      return { text: '伏笔放弃', class: 'badge-abandoned' }
    default:
      return { text: status, class: 'badge-default' }
  }
}

function getImportanceBadge(importance: string) {
  switch (importance) {
    case 'major':
      return { text: '主线要害', class: 'imp-major' }
    case 'normal':
      return { text: '普通线索', class: 'imp-normal' }
    case 'minor':
      return { text: '闲笔细节', class: 'imp-minor' }
    default:
      return { text: importance, class: 'imp-default' }
  }
}
</script>

<template>
  <div class="foreshadowing-tracker-panel">
    <div v-if="!foreshadowing.length" class="empty-state">
      <Eye :size="32" class="empty-icon" />
      <p>暂无伏笔数据。系统将根据大纲和章节，智能追踪伏笔与照应回收情况。</p>
    </div>

    <div v-else class="foreshadowing-list">
      <div v-for="fore in foreshadowing" :key="fore.id" class="foreshadowing-card" :class="{ 'paid-off-card': fore.status === 'paid_off' }">
        <!-- 头部信息 -->
        <div class="card-header">
          <div class="header-left">
            <span class="importance-tag" :class="getImportanceBadge(fore.importance).class">
              {{ getImportanceBadge(fore.importance).text }}
            </span>
            <h3 class="foreshadowing-title">
              {{ fore.title }}
            </h3>
          </div>
          <span class="status-badge" :class="getStatusBadge(fore.status).class">
            {{ getStatusBadge(fore.status).text }}
          </span>
        </div>

        <!-- 详细内容 -->
        <div class="info-body">
          <p v-if="fore.description" class="description-text">
            {{ fore.description }}
          </p>

          <!-- 伏笔链路 (设伏 -> 回收) -->
          <div class="trace-flow">
            <div class="flow-node">
              <span class="node-label">设伏章节</span>
              <span class="node-val font-semibold">
                {{ fore.setupChapterId ? `第 ${fore.setupChapterId} 章` : '大纲预设' }}
              </span>
            </div>
            <ArrowRight :size="14" class="flow-arrow" />
            <div v-if="fore.status === 'paid_off' && fore.payoffChapterId" class="flow-node">
              <span class="node-label text-success">回收章节</span>
              <span class="node-val text-success font-semibold">第 {{ fore.payoffChapterId }} 章</span>
            </div>
            <div v-else class="flow-node">
              <span class="node-label">预计回收</span>
              <span class="node-val font-semibold">
                {{ fore.expectedPayoffChapterId ? `第 ${fore.expectedPayoffChapterId} 章` : '未定' }}
              </span>
            </div>
          </div>

          <!-- 关联角色 -->
          <div v-if="fore.relatedCharacters" class="related-characters">
            <User :size="12" class="icon-user" />
            <span class="label">牵涉人物:</span>
            <span class="value">{{ fore.relatedCharacters }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.foreshadowing-tracker-panel {
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
      color: var(--primary-soft, #eff6ff);
    }

    p {
      font-size: 0.875rem;
      margin: 0;
    }
  }

  .foreshadowing-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .foreshadowing-card {
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

    &.paid-off-card {
      border-color: var(--success-soft, #d1fae5);
      background-color: var(--bg-subtle, #f9fafb);
      opacity: 0.85;

      .foreshadowing-title {
        text-decoration: line-through;
        color: var(--text-muted, #9ca3af) !important;
      }
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px dashed var(--border-light, #f3f4f6);
      padding-bottom: 0.75rem;
      margin-bottom: 0.75rem;
      gap: 0.5rem;

      .header-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;

        .importance-tag {
          font-size: 0.6875rem;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-weight: 600;
          white-space: nowrap;

          &.imp-major {
            background-color: var(--danger-soft, #fee2e2);
            color: var(--danger, #ef4444);
          }

          &.imp-normal {
            background-color: var(--primary-soft, #eff6ff);
            color: var(--primary, #3b82f6);
          }

          &.imp-minor {
            background-color: var(--bg-subtle, #f3f4f6);
            color: var(--text-secondary, #4b5563);
          }
        }

        .foreshadowing-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
          margin: 0;
          line-height: 1.3;
        }
      }

      .status-badge {
        font-size: 0.75rem;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-weight: 500;
        white-space: nowrap;

        &.badge-open {
          background-color: var(--warning-soft, #fef3c7);
          color: var(--warning-dark, #d97706);
        }

        &.badge-progressing {
          background-color: var(--primary-soft, #eff6ff);
          color: var(--primary, #3b82f6);
        }

        &.badge-paidoff {
          background-color: var(--success-soft, #d1fae5);
          color: var(--success, #10b981);
        }

        &.badge-abandoned {
          background-color: var(--bg-subtle, #f3f4f6);
          color: var(--text-muted, #9ca3af);
          text-decoration: line-through;
        }
      }
    }

    .info-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      .description-text {
        font-size: 0.8125rem;
        color: var(--text-secondary, #4b5563);
        margin: 0;
        line-height: 1.4;
      }

      .trace-flow {
        display: flex;
        align-items: center;
        gap: 1rem;
        background-color: var(--bg-subtle, #f9fafb);
        padding: 0.5rem 0.75rem;
        border-radius: 0.5rem;
        border: 1px solid var(--border-light, #f3f4f6);

        .flow-node {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;

          .node-label {
            font-size: 0.6875rem;
            color: var(--text-muted, #9ca3af);
          }

          .node-val {
            font-size: 0.8125rem;
            color: var(--text-primary, #374151);

            &.text-success {
              color: var(--success, #10b981);
            }
          }
        }

        .flow-arrow {
          color: var(--text-muted, #9ca3af);
        }
      }

      .related-characters {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--text-muted, #6b7280);

        .icon-user {
          color: var(--text-muted, #9ca3af);
        }

        .value {
          color: var(--text-secondary, #4b5563);
          font-weight: 500;
        }
      }
    }
  }
}
</style>
