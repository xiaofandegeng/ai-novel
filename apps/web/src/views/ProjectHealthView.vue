<script setup lang="ts">
import {
  NAppLayout,
  NLoadingState,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clapperboard,
  FileText,
  Flame,
  Lightbulb,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useHealthStore, useProjectStore } from '../stores/projects'

const route = useRoute()
const router = useRouter()
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

const riskVariant = {
  high: 'error',
  medium: 'warning',
  low: 'info',
} as const

const riskTypeLabel = {
  scene: '场景',
  foreshadowing: '伏笔',
  conflict: '冲突',
  quality: '质量',
  structure: '结构',
  knowledge: '知识',
} as const

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
        <!-- Actionable risks -->
        <div v-if="metrics.risks.length > 0" class="border border-border-light rounded-lg bg-bg-surface p-4">
          <h3 class="mb-3 flex items-center gap-2 text-sm text-text-primary font-bold">
            <AlertTriangle :size="16" class="text-yellow-500" /> 需要关注的风险
          </h3>
          <div class="space-y-2">
            <button
              v-for="risk in metrics.risks"
              :key="risk.id"
              class="w-full border border-border-light rounded-md bg-bg-page px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary-soft/20"
              @click="risk.targetRoute && router.push(risk.targetRoute)"
            >
              <div class="mb-1 flex items-center gap-2">
                <NTag :variant="riskVariant[risk.severity]" size="sm">
                  {{ risk.severity === 'high' ? '高风险' : risk.severity === 'medium' ? '中风险' : '低风险' }}
                </NTag>
                <NTag size="sm" variant="default">
                  {{ riskTypeLabel[risk.type] }}
                </NTag>
                <span class="text-sm text-text-primary font-semibold">{{ risk.title }}</span>
              </div>
              <p class="text-xs text-text-secondary leading-relaxed">
                {{ risk.message }}
              </p>
              <p v-if="risk.targetRoute" class="mt-1 text-xs text-primary">
                {{ risk.actionLabel }} →
              </p>
            </button>
          </div>
        </div>

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

        <!-- Scene health metrics -->
        <div class="border border-border-light rounded-lg bg-bg-surface p-4">
          <h3 class="mb-3 flex items-center gap-2 text-sm text-text-primary font-bold">
            <Clapperboard :size="16" class="text-primary" /> 场景健康
          </h3>

          <!-- Scene status distribution -->
          <div v-if="Object.keys(metrics.sceneStatusDistribution).length > 0" class="mb-4">
            <p class="mb-2 text-xs text-text-muted">
              场景状态分布
            </p>
            <div class="flex gap-4">
              <div v-for="(count, status) in metrics.sceneStatusDistribution" :key="status" class="flex items-center gap-2">
                <NTag
                  :variant="status === 'completed' ? 'success' : status === 'reviewed' ? 'warning' : status === 'drafting' ? 'info' : 'default'"
                  size="sm"
                >
                  {{ status === 'planned' ? '已规划' : status === 'drafting' ? '写作中' : status === 'reviewed' ? '待审核' : '已完成' }}
                </NTag>
                <span class="text-sm text-text-secondary font-medium">{{ count }}</span>
              </div>
            </div>
          </div>

          <!-- Warning cards -->
          <div class="grid grid-cols-3 mb-4 gap-3">
            <div class="border border-border-light rounded-md bg-bg-page p-3">
              <div class="flex items-center gap-2">
                <AlertTriangle v-if="metrics.scenesWithoutContent > 0" :size="14" class="text-yellow-500" />
                <FileText v-else :size="14" class="text-text-muted" />
                <span class="text-xs text-text-muted">无正文场景</span>
              </div>
              <div class="mt-1 text-lg text-text-primary font-bold">
                {{ metrics.scenesWithoutContent }}
              </div>
            </div>
            <div class="border border-border-light rounded-md bg-bg-page p-3">
              <div class="flex items-center gap-2">
                <AlertTriangle v-if="metrics.scenesWithoutPurpose > 0" :size="14" class="text-yellow-500" />
                <FileText v-else :size="14" class="text-text-muted" />
                <span class="text-xs text-text-muted">无目的场景</span>
              </div>
              <div class="mt-1 text-lg text-text-primary font-bold">
                {{ metrics.scenesWithoutPurpose }}
              </div>
            </div>
            <div class="border border-border-light rounded-md bg-bg-page p-3">
              <div class="flex items-center gap-2">
                <AlertTriangle v-if="metrics.scenesWithoutConflict > 0" :size="14" class="text-yellow-500" />
                <FileText v-else :size="14" class="text-text-muted" />
                <span class="text-xs text-text-muted">无冲突场景</span>
              </div>
              <div class="mt-1 text-lg text-text-primary font-bold">
                {{ metrics.scenesWithoutConflict }}
              </div>
            </div>
          </div>

          <!-- Chapters without scenes -->
          <div v-if="metrics.chaptersWithoutScenes.length > 0" class="mb-4">
            <p class="mb-2 text-xs text-text-muted">
              缺少场景规划的章节
            </p>
            <div class="space-y-1">
              <div
                v-for="ch in metrics.chaptersWithoutScenes"
                :key="ch.chapterId"
                class="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs transition-colors hover:bg-bg-page"
                @click="router.push({ path: `/project/${projectId}/outline`, query: { chapter: ch.chapterId } })"
              >
                <span class="text-text-secondary">
                  第{{ ch.chapterNumber }}章：{{ ch.title }}
                </span>
                <span class="text-primary">
                  去规划 →
                </span>
              </div>
            </div>
          </div>

          <!-- Scene word count deviation -->
          <div v-if="metrics.sceneWordCountDeviation.length > 0">
            <p class="mb-2 text-xs text-text-muted">
              场景字数偏差（目标 vs 实际）
            </p>
            <div class="space-y-1">
              <div
                v-for="sd in metrics.sceneWordCountDeviation"
                :key="sd.sceneId"
                class="flex items-center gap-3 text-xs"
              >
                <span class="w-32 truncate text-text-muted">
                  {{ sd.title || `场景 ${sd.sceneNumber}` }}
                </span>
                <span class="w-14 text-right text-text-secondary">{{ sd.actual }}</span>
                <span class="text-text-muted">/</span>
                <span class="w-14 text-text-secondary">{{ sd.target }}</span>
                <span
                  class="font-medium"
                  :class="Math.abs(sd.deviation) > sd.target * 0.3 ? 'text-red-500' : Math.abs(sd.deviation) > sd.target * 0.1 ? 'text-yellow-500' : 'text-green-500'"
                >
                  {{ sd.deviation > 0 ? '+' : '' }}{{ sd.deviation }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
