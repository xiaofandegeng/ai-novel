<script setup lang="ts">
import type {
  CockpitCharacterState,
  CockpitConflictState,
  CockpitForeshadowingState,
  CockpitHealthSummary,
  CockpitPlotDirection,
  CockpitRelationshipState,
} from '@ai-novel/shared'
import { Activity, Compass, Eye, Flame, User, Users } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import CharacterEmotionPanel from './character-emotion-panel.vue'
import ConflictTrendPanel from './conflict-trend-panel.vue'
import ForeshadowingTrackerPanel from './foreshadowing-tracker-panel.vue'
import HealthRiskPanel from './health-risk-panel.vue'
import PlotDirectionPanel from './plot-direction-panel.vue'

import RelationshipDynamicsPanel from './relationship-dynamics-panel.vue'

const props = defineProps<{
  characters: CockpitCharacterState[]
  relationships: CockpitRelationshipState[]
  conflicts: CockpitConflictState[]
  foreshadowing: CockpitForeshadowingState[]
  plotDirection: CockpitPlotDirection | null
  health: CockpitHealthSummary | null
  activeTab?: 'character' | 'relationship' | 'conflict' | 'foreshadowing' | 'plot' | 'health'
}>()

const emit = defineEmits<{
  (e: 'update:activeTab', tab: 'character' | 'relationship' | 'conflict' | 'foreshadowing' | 'plot' | 'health'): void
  (e: 'refresh'): void
}>()

const activeTab = ref<'character' | 'relationship' | 'conflict' | 'foreshadowing' | 'plot' | 'health'>('character')

watch(() => props.activeTab, (val) => {
  if (val && val !== activeTab.value) {
    activeTab.value = val
  }
}, { immediate: true })

function handleTabClick(tab: 'character' | 'relationship' | 'conflict' | 'foreshadowing' | 'plot' | 'health') {
  activeTab.value = tab
  emit('update:activeTab', tab)
}

const tabs = [
  { key: 'character', label: '角色情绪', icon: User },
  { key: 'relationship', label: '关系动态', icon: Users },
  { key: 'conflict', label: '矛盾冲突', icon: Flame },
  { key: 'foreshadowing', label: '伏笔台账', icon: Eye },
  { key: 'plot', label: '走向建议', icon: Compass },
  { key: 'health', label: '风险预警', icon: Activity },
] as const
</script>

<template>
  <div class="narrative-state-board">
    <!-- Tab 切换导航 -->
    <div class="tabs-nav">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="handleTabClick(tab.key)"
      >
        <component :is="tab.icon" :size="16" class="tab-icon" />
        <span class="tab-label">{{ tab.label }}</span>
        <!-- 当为风险预警且有风险时显示红点 -->
        <span
          v-if="tab.key === 'health' && health && health.riskCount > 0"
          class="risk-badge-dot"
        />
      </button>
    </div>

    <!-- 看板内容区域 -->
    <div class="board-content">
      <KeepAlive>
        <CharacterEmotionPanel
          v-if="activeTab === 'character'"
          :characters="characters"
        />
        <RelationshipDynamicsPanel
          v-else-if="activeTab === 'relationship'"
          :relationships="relationships"
        />
        <ConflictTrendPanel
          v-else-if="activeTab === 'conflict'"
          :conflicts="conflicts"
        />
        <ForeshadowingTrackerPanel
          v-else-if="activeTab === 'foreshadowing'"
          :foreshadowing="foreshadowing"
        />
        <PlotDirectionPanel
          v-else-if="activeTab === 'plot'"
          :plot-direction="plotDirection"
        />
        <HealthRiskPanel
          v-else-if="activeTab === 'health'"
          :health="health"
          @refresh="emit('refresh')"
        />
      </KeepAlive>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.narrative-state-board {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  .tabs-nav {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-light, #e5e7eb);
    background-color: var(--bg-subtle, #f9fafb);
    padding: 0.375rem 0.5rem 0 0.5rem;
    gap: 0.25rem;
    scrollbar-width: none; // Firefox

    &::-webkit-scrollbar {
      display: none; // Chrome, Safari
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.625rem 0.875rem;
      border: 1px solid transparent;
      border-bottom: none;
      background: none;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--text-secondary, #4b5563);
      cursor: pointer;
      border-radius: 0.5rem 0.5rem 0 0;
      white-space: nowrap;
      position: relative;
      transition: all 0.2s ease;

      &:hover {
        color: var(--primary, #3b82f6);
        background-color: var(--bg-surface, #ffffff);
      }

      &.active {
        color: var(--primary, #3b82f6);
        background-color: var(--bg-surface, #ffffff);
        border-color: var(--border-light, #e5e7eb);
        font-weight: 600;

        &::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background-color: var(--primary, #3b82f6);
        }
      }

      .tab-icon {
        flex-shrink: 0;
      }

      .risk-badge-dot {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 6px;
        height: 6px;
        background-color: var(--danger, #ef4444);
        border-radius: 9999px;
      }
    }
  }

  .board-content {
    flex: 1;
    overflow: hidden;
    position: relative;
    background-color: var(--bg-surface, #ffffff);
  }
}

@media (max-width: 767px) {
  .narrative-state-board {
    height: auto;
    min-height: 560px;

    .board-content {
      min-height: 500px;
      overflow: visible;
    }
  }
}
</style>
