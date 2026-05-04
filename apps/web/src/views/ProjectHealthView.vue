<script setup lang="ts">
import {
  NAppLayout,
  NLoadingState,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Flame,
  Lightbulb,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useHealthStore, useProjectStore } from '../stores/projects'

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const healthStore = useHealthStore()

const loading = ref(true)

const metrics = computed(() => healthStore.metrics)

const completionPercent = computed(() => {
  if (!metrics.value)
    return 0
  return metrics.value.totalChapters > 0
    ? Math.round((metrics.value.completedChapters / metrics.value.totalChapters) * 100)
    : 0
})

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      healthStore.fetchMetrics(projectId),
    ])
  }
  catch {
    toast.add('加载健康数据失败', 'error')
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
  >
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full overflow-y-auto p-6">
      <div class="mb-6">
        <h1 class="text-lg text-text-primary font-bold">
          项目健康面板
        </h1>
        <p class="text-sm text-text-muted">
          基于已有数据的综合分析
        </p>
      </div>

      <NLoadingState v-if="loading" />
      <div v-else-if="!metrics" class="py-12 text-center text-text-muted">
        <Activity :size="32" class="mx-auto mb-3 opacity-40" />
        <p class="text-sm">
          暂无健康数据
        </p>
      </div>
      <div v-else class="space-y-6">
        <!-- Summary cards -->
        <div class="grid grid-cols-4 gap-4">
          <div class="border border-border-light rounded-lg bg-bg-surface p-4">
            <div class="mb-2 flex items-center gap-2">
              <BarChart3 :size="16" class="text-text-muted" />
              <span class="text-xs text-text-muted">总字数</span>
            </div>
            <div class="text-xl text-text-primary font-bold">
              {{ metrics.totalWords.toLocaleString() }}
            </div>
            <div class="text-xs text-text-muted">
              均章 {{ metrics.averageChapterWords.toLocaleString() }} 字
            </div>
          </div>

          <div class="border border-border-light rounded-lg bg-bg-surface p-4">
            <div class="mb-2 flex items-center gap-2">
              <CheckCircle2 :size="16" class="text-text-muted" />
              <span class="text-xs text-text-muted">完成进度</span>
            </div>
            <div class="text-xl text-text-primary font-bold">
              {{ completionPercent }}%
            </div>
            <div class="text-xs text-text-muted">
              {{ metrics.completedChapters }} / {{ metrics.totalChapters }} 章
            </div>
          </div>

          <div class="border border-border-light rounded-lg bg-bg-surface p-4">
            <div class="mb-2 flex items-center gap-2">
              <Flame :size="16" class="text-text-muted" />
              <span class="text-xs text-text-muted">活跃冲突</span>
            </div>
            <div class="text-xl text-text-primary font-bold">
              {{ metrics.activeConflicts }}
            </div>
            <div class="text-xs text-text-muted">
              平均强度 {{ metrics.conflictIntensityAvg }}
            </div>
          </div>

          <div class="border border-border-light rounded-lg bg-bg-surface p-4">
            <div class="mb-2 flex items-center gap-2">
              <Lightbulb :size="16" class="text-text-muted" />
              <span class="text-xs text-text-muted">待回收伏笔</span>
            </div>
            <div class="text-xl text-text-primary font-bold">
              {{ metrics.openForeshadowingCount }}
            </div>
            <div class="text-xs text-text-muted">
              事实三元组: {{ metrics.confirmedTriples }} 确认 / {{ metrics.pendingTriples }} 待确认
            </div>
          </div>
        </div>

        <!-- Foreshadowing by status -->
        <div class="border border-border-light rounded-lg bg-bg-surface p-4">
          <h3 class="mb-3 text-sm text-text-primary font-bold">
            伏笔状态分布
          </h3>
          <div class="flex gap-4">
            <div v-for="(count, status) in metrics.foreshadowingByStatus" :key="status" class="flex items-center gap-2">
              <NTag
                :variant="status === 'open' ? 'info' : status === 'progressing' ? 'warning' : status === 'paid_off' ? 'success' : 'default'"
                size="sm"
              >
                {{ status === 'open' ? '待回收' : status === 'progressing' ? '推进中' : status === 'paid_off' ? '已回收' : '已放弃' }}
              </NTag>
              <span class="text-sm text-text-secondary font-medium">{{ count }}</span>
            </div>
          </div>
        </div>

        <!-- Element frequency -->
        <div v-if="metrics.elementFrequency.length > 0" class="border border-border-light rounded-lg bg-bg-surface p-4">
          <h3 class="mb-3 text-sm text-text-primary font-bold">
            元素出场频率 Top 10
          </h3>
          <div class="space-y-2">
            <div
              v-for="el in metrics.elementFrequency.slice(0, 10)"
              :key="`${el.type}:${el.name}`"
              class="flex items-center gap-3"
            >
              <span class="w-24 truncate text-xs text-text-muted">{{ el.name }}</span>
              <div class="h-4 flex-1 overflow-hidden rounded-full bg-bg-page">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${Math.min(100, (el.count / (metrics.elementFrequency[0]?.count || 1)) * 100)}%` }"
                />
              </div>
              <span class="w-8 text-right text-xs text-text-secondary">{{ el.count }}</span>
            </div>
          </div>
        </div>

        <!-- Quality trend -->
        <div v-if="metrics.qualityTrend.length > 0" class="border border-border-light rounded-lg bg-bg-surface p-4">
          <h3 class="mb-3 text-sm text-text-primary font-bold">
            质量评分趋势
          </h3>
          <div class="space-y-1">
            <div
              v-for="qt in metrics.qualityTrend"
              :key="qt.chapter"
              class="flex items-center gap-3"
            >
              <span class="w-16 text-xs text-text-muted">第{{ qt.chapter }}章</span>
              <div class="h-4 flex-1 overflow-hidden rounded-full bg-bg-page">
                <div
                  class="h-full rounded-full"
                  :class="qt.score >= 80 ? 'bg-green-400' : qt.score >= 60 ? 'bg-yellow-400' : 'bg-red-400'"
                  :style="{ width: `${qt.score}%` }"
                />
              </div>
              <span class="w-8 text-right text-xs text-text-secondary">{{ qt.score }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
