<script setup lang="ts">
import type { DailyWritingStats } from '@ai-novel/shared'
import { NAppLayout, NButton, NLoadingState } from '@ai-novel/ui'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  Cpu,
  TrendingUp,
  Users,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project.store'
import * as goalsApi from '../api/writing-goals'
import AppSidebar from '../components/AppSidebar.vue'

const route = useRoute()
const projectId = route.params.id as string
const projectStore = useProjectStore()

const loading = ref(true)
const report = ref<any>(null)
const dailyStats = ref<DailyWritingStats[]>([])

async function fetchReport() {
  loading.value = true
  try {
    const res = await fetch(`/api/authoring-reports/${projectId}/weekly`)
    const data = await res.json()
    if (data.success) {
      report.value = data.data
      // Load daily stats for the same week
      if (data.data.startDate && data.data.endDate) {
        try {
          dailyStats.value = await goalsApi.fetchDailyStats(
            projectId,
            data.data.startDate,
            data.data.endDate,
          )
        }
        catch { /* ignore */ }
      }
    }
  }
  catch (err) {
    console.error('Failed to fetch report:', err)
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchReport()
})

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
  >
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full overflow-y-auto bg-bg-page p-8">
      <div class="mx-auto max-w-4xl space-y-8">
        <!-- Header -->
        <div class="flex items-end justify-between">
          <div>
            <div class="mb-2 flex items-center gap-2 text-primary">
              <Calendar :size="18" />
              <span class="text-xs font-bold tracking-widest uppercase">Weekly Report</span>
            </div>
            <h1 class="text-3xl text-text-primary font-black">
              创作周报
            </h1>
            <p v-if="report" class="mt-2 text-text-muted">
              {{ formatDate(report.startDate) }} - {{ formatDate(report.endDate) }}
            </p>
          </div>
          <NButton variant="secondary" size="sm" @click="fetchReport">
            刷新数据
          </NButton>
        </div>

        <NLoadingState v-if="loading" />

        <div v-else-if="report" class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <!-- Stats Cards -->
          <div class="col-span-1 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-border-light">
            <div class="mb-4 h-10 w-10 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <TrendingUp :size="20" />
            </div>
            <div class="text-2xl text-text-primary font-black">
              {{ report.wordCountAdded }}
            </div>
            <div class="text-xs text-text-muted">
              本周新增字数
            </div>
          </div>

          <div class="col-span-1 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-border-light">
            <div class="mb-4 h-10 w-10 flex items-center justify-center rounded-xl bg-green-50 text-green-500">
              <BookOpen :size="20" />
            </div>
            <div class="text-2xl text-text-primary font-black">
              {{ report.chaptersCompleted }}
            </div>
            <div class="text-xs text-text-muted">
              本周完成章节
            </div>
          </div>

          <div class="col-span-1 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-border-light">
            <div class="mb-4 h-10 w-10 flex items-center justify-center rounded-xl bg-purple-50 text-purple-500">
              <Users :size="20" />
            </div>
            <div class="text-2xl text-text-primary font-black">
              {{ report.entitiesAdded.characters + report.entitiesAdded.relationships + report.entitiesAdded.conflicts }}
            </div>
            <div class="text-xs text-text-muted">
              本周新增设定
            </div>
          </div>

          <!-- AI Usage Section -->
          <div class="col-span-1 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-border-light md:col-span-2">
            <h2 class="mb-6 flex items-center gap-2 text-lg text-text-primary font-bold">
              <Cpu :size="20" class="text-primary" />
              AI 创作效能
            </h2>

            <div class="grid grid-cols-2 gap-8">
              <div class="space-y-1">
                <div class="text-xs text-text-muted font-bold tracking-wider uppercase">
                  接受率
                </div>
                <div class="flex items-end gap-2">
                  <span class="text-3xl text-text-primary font-black">{{ Math.round(report.aiUsage.acceptanceRate * 100) }}%</span>
                  <div class="mb-1 h-2 w-24 overflow-hidden rounded-full bg-bg-subtle">
                    <div class="h-full bg-primary" :style="{ width: `${report.aiUsage.acceptanceRate * 100}%` }" />
                  </div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-xs text-text-muted font-bold tracking-wider uppercase">
                  Tokens 消耗
                </div>
                <div class="text-3xl text-text-primary font-black">
                  {{ (report.aiUsage.totalTokens / 1000).toFixed(1) }}k
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-xs text-text-muted font-bold tracking-wider uppercase">
                  成功率
                </div>
                <div class="text-3xl text-text-primary font-black">
                  {{ Math.round(report.aiUsage.successRate * 100) }}%
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-xs text-text-muted font-bold tracking-wider uppercase">
                  平均延迟
                </div>
                <div class="text-3xl text-text-primary font-black">
                  {{ (report.aiUsage.averageLatency / 1000).toFixed(1) }}s
                </div>
              </div>
            </div>
          </div>

          <!-- Risk & Suggestions -->
          <div class="bg-primary-dark col-span-1 rounded-2xl p-8 text-white shadow-xl">
            <h2 class="mb-6 flex items-center gap-2 text-lg font-bold">
              <AlertTriangle :size="20" class="text-yellow-400" />
              系统建议
            </h2>

            <ul class="space-y-4">
              <li class="flex items-start gap-3">
                <div class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
                <p class="text-xs text-primary-soft">
                  本周新增 {{ report.entitiesAdded.foreshadowing }} 个伏笔，建议下周通过 AI 提示回收至少 1 个。
                </p>
              </li>
              <li class="flex items-start gap-3">
                <div class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
                <p class="text-xs text-primary-soft">
                  AI 接受率低于 80%，建议检查正文 Prompt 约束是否过紧。
                </p>
              </li>
            </ul>

            <NButton class="mt-8 w-full border-white/20 bg-white/10 hover:bg-white/20" variant="secondary">
              开始复盘
              <ArrowRight :size="14" class="ml-2" />
            </NButton>
          </div>

          <!-- Daily Writing Stats -->
          <div v-if="dailyStats.length > 0" class="col-span-1 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-border-light md:col-span-3">
            <h2 class="mb-6 flex items-center gap-2 text-lg text-text-primary font-bold">
              <TrendingUp :size="20" class="text-primary" />
              每日字数统计
            </h2>
            <div class="daily-chart-container flex items-end gap-2">
              <div
                v-for="stat in dailyStats"
                :key="stat.id"
                class="flex flex-1 flex-col items-center justify-end"
              >
                <div class="w-full rounded-t bg-primary/80" :style="{ height: `${Math.max(4, (stat.wordsAdded / Math.max(...dailyStats.map(s => s.wordsAdded), 1)) * 100)}px` }" :title="`${stat.wordsAdded} 字`" />
                <span class="mt-1 text-xs text-text-muted">{{ new Date(stat.date).toLocaleDateString('zh-CN', { weekday: 'short' }) }}</span>
              </div>
            </div>
            <div class="mt-3 flex gap-4 text-xs text-text-muted">
              <span>总字数: {{ dailyStats.reduce((s, d) => s + d.wordsAdded, 0) }}</span>
              <span>手写: {{ dailyStats.reduce((s, d) => s + d.manualWordsAdded, 0) }}</span>
              <span>AI 接受: {{ dailyStats.reduce((s, d) => s + d.aiWordsAccepted, 0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>

<style lang="scss" scoped>
.daily-chart-container {
  height: 120px;
}
</style>
