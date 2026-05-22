<script setup lang="ts">
import type { CockpitConflictState } from '@ai-novel/shared'
import { AlertCircle, CheckCircle2, Flame, Users } from 'lucide-vue-next'

defineProps<{
  conflicts: CockpitConflictState[]
}>()

function getStatusBadge(status: string) {
  switch (status) {
    case 'latent':
      return { text: '潜在潜伏', class: 'badge-latent' }
    case 'forming':
      return { text: '初露端倪', class: 'badge-forming' }
    case 'escalating':
      return { text: '矛盾升级', class: 'badge-escalating' }
    case 'exploding':
      return { text: '剧烈爆发', class: 'badge-exploding' }
    case 'resolved':
      return { text: '冲突解决', class: 'badge-resolved' }
    case 'abandoned':
      return { text: '线索搁置', class: 'badge-abandoned' }
    default:
      return { text: status, class: 'badge-default' }
  }
}

function getIntensityStyle(intensity: number) {
  // 假定 0-100，或 0-10。如果是 0-10 则乘以 10。
  const val = intensity <= 10 ? intensity * 10 : intensity
  const percent = Math.min(100, Math.max(0, val))
  let color = 'var(--primary, #3b82f6)'
  if (percent > 40)
    color = 'var(--warning, #f59e0b)'
  if (percent > 75)
    color = 'var(--danger, #ef4444)'

  return {
    width: `${percent}%`,
    backgroundColor: color,
  }
}
</script>

<template>
  <div class="conflict-trend-panel">
    <div v-if="!conflicts.length" class="empty-state">
      <Flame :size="32" class="empty-icon" />
      <p>暂无矛盾冲突数据，剧情冲突被拆解后在此进行可视化展示。</p>
    </div>

    <div v-else class="conflict-list">
      <div v-for="con in conflicts" :key="con.id" class="conflict-card" :class="{ 'resolved-card': con.status === 'resolved' }">
        <!-- 头部标题 -->
        <div class="card-header">
          <div class="conflict-title-wrap">
            <Flame :size="16" class="icon-flame" :class="{ spinning: con.status === 'exploding' }" />
            <h3 class="conflict-title">
              {{ con.title }}
            </h3>
          </div>
          <span class="status-badge" :class="getStatusBadge(con.status).class">
            {{ getStatusBadge(con.status).text }}
          </span>
        </div>

        <!-- 详细信息区 -->
        <div class="info-body">
          <!-- 参与人员 -->
          <div v-if="con.participants" class="info-row">
            <span class="info-label">
              <Users :size="12" />
              对立角色:
            </span>
            <span class="info-value font-medium">{{ con.participants }}</span>
          </div>

          <!-- 矛盾类型 -->
          <div class="info-row">
            <span class="info-label">
              <AlertCircle :size="12" />
              矛盾类型:
            </span>
            <span class="info-value">
              {{ con.type === 'internal' ? '内心挣扎 (Internal)' : '外部对抗 (External)' }}
            </span>
          </div>

          <!-- 矛盾强度 -->
          <div class="intensity-container">
            <div class="intensity-label">
              <span>烈度指数</span>
              <span class="intensity-number font-bold">{{ con.intensity }}</span>
            </div>
            <div class="intensity-bar">
              <div class="intensity-fill" :style="getIntensityStyle(con.intensity)" />
            </div>
          </div>

          <!-- 矛盾梗概 -->
          <div v-if="con.description" class="desc-box">
            <div class="box-title">
              对抗现状
            </div>
            <p class="desc-text">
              {{ con.description }}
            </p>
          </div>

          <!-- 解决思路 -->
          <div v-if="con.resolution" class="resolution-box">
            <div class="box-title">
              <CheckCircle2 :size="12" class="icon-check" />
              解决契机/落脚点
            </div>
            <p class="desc-text text-success">
              {{ con.resolution }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.conflict-trend-panel {
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
      color: var(--danger-soft, #fecdd3);
    }

    p {
      font-size: 0.875rem;
      margin: 0;
    }
  }

  .conflict-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .conflict-card {
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

    &.resolved-card {
      opacity: 0.75;
      border-color: var(--success-soft, #d1fae5);
      background-color: var(--bg-subtle, #f9fafb);

      .icon-flame {
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

      .conflict-title-wrap {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;

        .icon-flame {
          color: var(--danger, #ef4444);
          flex-shrink: 0;

          &.spinning {
            animation: pulse 1s infinite alternate;
          }
        }

        .conflict-title {
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

        &.badge-latent {
          background-color: var(--bg-subtle, #f3f4f6);
          color: var(--text-secondary, #4b5563);
        }

        &.badge-forming {
          background-color: var(--primary-soft, #eff6ff);
          color: var(--primary, #3b82f6);
        }

        &.badge-escalating {
          background-color: var(--warning-soft, #fef3c7);
          color: var(--warning-dark, #d97706);
        }

        &.badge-exploding {
          background-color: var(--danger-soft, #fee2e2);
          color: var(--danger, #ef4444);
          animation: blink 1.2s infinite;
        }

        &.badge-resolved {
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
      gap: 0.625rem;

      .info-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;

        .info-label {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          color: var(--text-muted, #6b7280);
        }

        .info-value {
          color: var(--text-secondary, #4b5563);
        }

        .font-medium {
          font-weight: 500;
          color: var(--text-primary, #111827);
        }
      }

      .intensity-container {
        margin: 0.25rem 0;

        .intensity-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-muted, #6b7280);
          margin-bottom: 0.25rem;

          .intensity-number {
            color: var(--text-primary, #111827);
          }
        }

        .intensity-bar {
          height: 6px;
          background-color: var(--bg-subtle, #f3f4f6);
          border-radius: 9999px;
          overflow: hidden;

          .intensity-fill {
            height: 100%;
            border-radius: 9999px;
            transition: width 0.4s ease;
          }
        }
      }

      .desc-box,
      .resolution-box {
        background-color: var(--bg-subtle, #f9fafb);
        padding: 0.5rem 0.75rem;
        border-radius: 0.375rem;
        font-size: 0.8125rem;

        .box-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary, #4b5563);
          margin-bottom: 0.25rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .desc-text {
          color: var(--text-secondary, #4b5563);
          margin: 0;
          line-height: 1.4;
        }
      }

      .resolution-box {
        border-left: 3px solid var(--success, #10b981);

        .icon-check {
          color: var(--success, #10b981);
        }

        .text-success {
          color: var(--success-dark, #065f46);
        }
      }
    }
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.2);
    opacity: 1;
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
