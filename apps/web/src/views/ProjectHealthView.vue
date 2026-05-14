<script setup lang="ts">
import type { HealthMetrics } from '@ai-novel/shared'
import { NButton, NPanel, NTag } from '@ai-novel/ui'

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Info,
  Lightbulb,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-vue-next'

import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchHealthMetrics } from '../api/health-metrics'
import HealthRadarChart from '../features/health/components/HealthRadarChart.vue'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string

const metrics = ref<HealthMetrics | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function loadMetrics() {
  loading.value = true
  error.value = null
  try {
    metrics.value = await fetchHealthMetrics(projectId)
  }
  catch (e: any) {
    error.value = e.message
  }
  finally {
    loading.value = false
  }
}

const overallScore = computed(() => {
  if (!metrics.value)
    return 0
  // Simple weighted score calculation
  const chaptersWeight = (metrics.value.completedChapters / (metrics.value.totalChapters || 1)) * 30
  const conflictsWeight = (metrics.value.activeConflicts > 0 ? 20 : 0)
  const risksWeight = Math.max(0, 50 - (metrics.value.risks.length * 10))
  return Math.round(chaptersWeight + conflictsWeight + risksWeight)
})

function getSeverityClass(severity: string) {
  switch (severity) {
    case 'high': return 'bg-red-500/10 text-red-500 border-red-500/20'
    case 'medium': return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    case 'low': return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
  }
}

onMounted(() => {
  loadMetrics()
})
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto bg-bg-page p-8">
    <header class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl text-text-primary font-bold">
          <Activity class="text-primary" :size="24" />
          项目创作健康评估
        </h1>
        <p class="mt-1 text-sm text-text-muted">
          深度分析长篇小说创作状态，识别连贯性、张力和节奏风险。
        </p>
      </div>
      <NButton :loading="loading" variant="primary" @click="loadMetrics">
        <RefreshCw class="mr-2" :class="{ 'animate-spin': loading }" :size="16" />
        刷新指标
      </NButton>
    </header>

    <div v-if="error" class="mb-6 flex items-center gap-3 border border-red-200 rounded-lg bg-red-50 p-4 text-red-600">
      <AlertTriangle :size="20" />
      <span>{{ error }}</span>
    </div>

    <div v-if="metrics" class="space-y-8">
      <!-- Top Row: Overview Cards -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-4 md:grid-cols-2">
        <NPanel class="relative overflow-hidden border-primary/10 from-primary-soft/30 to-bg-surface bg-gradient-to-br lg:col-span-2">
          <div class="flex items-center gap-8">
            <div class="relative flex-shrink-0">
              <HealthRadarChart v-if="metrics" :metrics="metrics.radarMetrics" :size="160" />
            </div>
            <div class="flex-1">
              <span class="text-xs text-primary font-bold tracking-widest uppercase">总体健康分</span>
              <div class="mt-2 flex items-baseline gap-1">
                <span class="text-5xl text-text-primary font-bold">{{ overallScore }}</span>
                <span class="text-sm text-text-muted">/ 100</span>
              </div>
              <p class="mt-2 text-xs text-text-muted leading-relaxed">
                基于主题、人物、伏笔、矛盾、节奏和文风六个维度的深度扫描结果。
              </p>
              <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-bg-page">
                <div class="h-full bg-primary transition-all duration-1000" :style="{ width: `${overallScore}%` }" />
              </div>
            </div>
          </div>
        </NPanel>

        <NPanel>
          <span class="text-xs text-text-muted font-bold tracking-widest uppercase">连载进度</span>
          <div class="mt-2 flex items-baseline gap-1">
            <span class="text-3xl text-text-primary font-bold">{{ metrics.completedChapters }}</span>
            <span class="text-sm text-text-muted">/ {{ metrics.totalChapters }} 章</span>
          </div>
          <div class="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
            <TrendingUp :size="12" />
            累计字数：{{ (metrics.totalWords / 10000).toFixed(1) }} 万字
          </div>
        </NPanel>

        <NPanel>
          <span class="text-xs text-text-muted font-bold tracking-widest uppercase">活跃冲突强度</span>
          <div class="mt-2 flex items-baseline gap-1">
            <span class="text-3xl text-text-primary font-bold">{{ metrics.conflictIntensityAvg }}</span>
            <span class="text-sm text-text-muted">/ 10</span>
          </div>
          <div class="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
            <Zap class="text-amber-500" :size="12" />
            活跃冲突数：{{ metrics.activeConflicts }}
          </div>
        </NPanel>

        <NPanel>
          <span class="text-xs text-text-muted font-bold tracking-widest uppercase">待回收伏笔</span>
          <div class="mt-2 flex items-baseline gap-1">
            <span class="text-3xl text-text-primary font-bold">{{ metrics.openForeshadowingCount }}</span>
            <span class="text-sm text-text-muted">个</span>
          </div>
          <div class="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
            <Lightbulb class="text-primary" :size="12" />
            已确认事实：{{ metrics.confirmedTriples }}
          </div>
        </NPanel>
      </div>

      <!-- Main Section: Risks & Detailed Metrics -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <!-- Left: Risks & Warnings -->
        <div class="lg:col-span-2 space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-lg text-text-primary font-bold">
              <AlertTriangle class="text-amber-500" :size="20" />
              风险识别与改进建议
            </h2>
            <NTag variant="info">
              {{ metrics.risks.length }} 个待处理
            </NTag>
          </div>

          <div v-if="metrics.risks.length === 0" class="border border-green-100 rounded-xl bg-green-50 p-8 text-center">
            <CheckCircle2 class="mx-auto mb-3 text-green-500" :size="48" />
            <p class="text-green-700 font-bold">
              暂无明显健康风险
            </p>
            <p class="mt-1 text-sm text-green-600">
              项目逻辑连贯，指标处于理想状态。
            </p>
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="risk in metrics.risks"
              :key="risk.id"
              class="flex items-start gap-4 border border-border-light rounded-xl bg-bg-surface p-5 transition-shadow hover:shadow-md"
            >
              <div :class="`p-2 rounded-lg border ${getSeverityClass(risk.severity)}`">
                <AlertTriangle v-if="risk.severity === 'high'" :size="20" />
                <Info v-else :size="20" />
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <h3 class="text-text-primary font-bold">
                    {{ risk.title }}
                  </h3>
                  <NTag :variant="risk.severity === 'high' ? 'error' : 'warning'" size="sm">
                    {{ risk.severity === 'high' ? '高风险' : risk.severity === 'medium' ? '中风险' : '低风险' }}
                  </NTag>
                </div>
                <p class="mt-2 text-sm text-text-muted leading-relaxed">
                  {{ risk.message }}
                </p>
                <div v-if="risk.evidence && risk.evidence.length > 0" class="mt-3 border-t border-border-light/30 pt-3">
                  <div class="mb-1 text-[11px] text-text-muted font-bold tracking-wider uppercase">
                    证据来源
                  </div>
                  <ul class="space-y-1">
                    <li v-for="ev in risk.evidence" :key="ev" class="flex items-center gap-2 text-xs text-text-muted">
                      <div class="h-1 w-1 rounded-full bg-border-light" />
                      {{ ev }}
                    </li>
                  </ul>
                </div>
                <div v-if="risk.suggestions && risk.suggestions.length > 0" class="mt-3 rounded-lg bg-primary/5 p-3">
                  <div class="mb-1 flex items-center gap-1.5 text-[10px] text-primary font-bold tracking-wider uppercase">
                    <Lightbulb :size="12" /> 修复建议
                  </div>
                  <ul class="space-y-1">
                    <li v-for="sug in risk.suggestions" :key="sug" class="text-xs text-text-secondary leading-relaxed">
                      • {{ sug }}
                    </li>
                  </ul>
                </div>
                <div class="mt-4 flex gap-3">
                  <NButton
                    v-if="risk.targetRoute"
                    size="sm"
                    variant="primary"
                    @click="router.push(risk.targetRoute)"
                  >
                    {{ risk.actionLabel }}
                    <ArrowRight class="ml-1" :size="14" />
                  </NButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Stats -->
        <div class="space-y-8">
          <section>
            <h2 class="mb-4 flex items-center gap-2 text-lg text-text-primary font-bold">
              <Target class="text-primary" :size="20" />
              元素共场频率
            </h2>
            <div class="overflow-hidden border border-border-light rounded-xl bg-bg-surface shadow-sm">
              <div v-if="metrics.elementFrequency.length === 0" class="p-8 text-center text-sm text-text-muted italic">
                暂无共场数据
              </div>
              <div v-else class="divide-y divide-border-light/50">
                <div v-for="el in metrics.elementFrequency" :key="el.name" class="flex items-center justify-between p-3">
                  <div class="flex items-center gap-2">
                    <Users v-if="el.type === 'character'" class="text-primary" :size="14" />
                    <BookOpen v-else class="text-text-muted" :size="14" />
                    <span class="text-xs text-text-primary font-medium">{{ el.name }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="h-1.5 w-20 overflow-hidden rounded-full bg-bg-page">
                      <div class="h-full bg-primary/40" :style="{ width: `${Math.min(100, el.count * 10)}%` }" />
                    </div>
                    <span class="text-[10px] text-text-muted font-mono">{{ el.count }} 次</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 class="mb-4 text-lg text-text-primary font-bold">
              场景状态分布
            </h2>
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="(count, status) in metrics.sceneStatusDistribution"
                :key="status"
                class="border border-border-light rounded-lg bg-bg-surface p-3 text-center"
              >
                <div class="text-lg text-text-primary font-bold">
                  {{ count }}
                </div>
                <div class="text-[10px] text-text-muted tracking-wider uppercase">
                  {{ status }}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div v-else-if="loading" class="flex flex-1 flex-col items-center justify-center">
      <RefreshCw class="animate-spin text-primary/30" :size="48" />
      <p class="mt-4 text-text-muted">
        正在计算项目健康指标...
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.animate-spin {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
