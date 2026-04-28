<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NLoadingState,
  useToast,
} from '@ai-novel/ui'
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ArrowLeft,
  ChevronLeft,
  Flame,
  History,
  LayoutDashboard,
  Lightbulb,
  Sparkles,
  Users,
  Zap,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useApi } from '../composables/useApi'
import {
  useChapterStore,
  useProjectStore,
} from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()
const api = useApi()

const projectStore = useProjectStore()
const chapterStore = useChapterStore()

const loading = ref(true)
const analyzing = ref(false)
const reports = ref<any[]>([])
const selectedChapterId = ref('')
const activeReport = ref<any>(null)

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      chapterStore.fetchChapters(projectId),
      fetchReports(),
    ])

    if (chapterStore.chapters.length > 0) {
      selectedChapterId.value = chapterStore.chapters[0].id
    }
  }
  catch {
    toast.add('Failed to load quality reports', 'error')
  }
  finally {
    loading.value = false
  }
})

async function fetchReports() {
  const data = await api.get<any[]>(`/api/projects/${projectId}/quality/reports`)
  reports.value = data
  if (data.length > 0 && !activeReport.value) {
    activeReport.value = data[0]
  }
}

async function runAnalysis() {
  if (!selectedChapterId.value)
    return

  analyzing.value = true
  try {
    const report = await api.post<any>(`/api/projects/${projectId}/chapters/${selectedChapterId.value}/quality-check`, {})
    toast.add('Quality analysis complete', 'success')
    await fetchReports()
    activeReport.value = report
  }
  catch (e: any) {
    toast.add(e.message || 'Analysis failed', 'error')
  }
  finally {
    analyzing.value = false
  }
}

function selectReport(report: any) {
  activeReport.value = report
}

function parseJson(str: string) {
  try {
    return JSON.parse(str)
  }
  catch {
    return []
  }
}

function getScoreColor(score: number) {
  if (score >= 90)
    return 'text-semantic-success'
  if (score >= 75)
    return 'text-primary'
  if (score >= 60)
    return 'text-semantic-warning'
  return 'text-semantic-error'
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || 'Loading...'" :project-id="projectId">
    <template #topbar-left>
      <div class="flex items-center gap-4">
        <router-link
          to="/"
          class="flex items-center gap-2 text-text-muted transition-colors hover:text-primary"
          title="返回书库"
        >
          <ArrowLeft :size="20" />
        </router-link>

        <div class="h-6 w-px bg-border-light" />

        <router-link
          :to="`/project/${projectId}`"
          class="text-base text-text-primary font-semibold transition-colors hover:text-primary"
        >
          {{ projectStore.currentProject?.title || 'Loading...' }}
        </router-link>
      </div>
    </template>
<template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full flex overflow-hidden bg-bg-page">
      <!-- Sidebar for Reports -->
      <aside class="w-80 flex shrink-0 flex-col border-r border-border-light bg-bg-surface">
        <div class="border-b border-border-light p-6 space-y-4">
          <h2 class="flex items-center gap-2 text-sm text-text-muted font-bold tracking-widest uppercase">
            <NButton variant="ghost" size="sm" class="-ml-2 h-8 w-8 p-0" @click="router.back()">
              <ChevronLeft :size="18" />
            </NButton>
            <BarChart3 :size="16" /> 质量评估报告
          </h2>

          <div class="space-y-2">
            <select v-model="selectedChapterId" class="w-full border border-border-light rounded-xl bg-bg-page px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary">
              <option v-for="ch in chapterStore.chapters" :key="ch.id" :value="ch.id">
                第 {{ ch.chapterNumber }} 章: {{ ch.title }}
              </option>
            </select>
            <NButton class="w-full" variant="ai" :disabled="analyzing" @click="runAnalysis">
              <Sparkles :size="16" class="mr-2" /> {{ analyzing ? '评估中...' : '提交新评估' }}
            </NButton>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="reports.length === 0" class="py-10 text-center text-xs opacity-30">
            暂无评估记录
          </div>
          <button
            v-for="report in reports"
            :key="report.id"
            class="w-full border rounded-2xl p-4 text-left transition-all"
            :class="activeReport?.id === report.id ? 'bg-primary/5 border-primary/20 shadow-sm' : 'border-transparent hover:bg-bg-subtle text-text-secondary'"
            @click="selectReport(report)"
          >
            <div class="mb-1 flex items-start justify-between">
              <span class="truncate pr-2 text-xs font-bold">
                第 {{ chapterStore.chapters.find(c => c.id === report.chapterId)?.chapterNumber || '?' }} 章
              </span>
              <span class="text-lg font-black" :class="getScoreColor(report.score)">{{ report.score }}</span>
            </div>
            <div class="flex items-center gap-1 text-[10px] text-text-muted">
              <CheckCircle2 :size="10" /> {{ new Date(report.createdAt).toLocaleDateString() }}
            </div>
          </button>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto p-12">
        <div v-if="loading" class="h-full flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!activeReport" class="h-full flex flex-col items-center justify-center text-center opacity-30">
          <Zap :size="80" stroke-width="1" class="mb-6 text-text-muted" />
          <h2 class="text-2xl font-bold">
            创作质量体检
          </h2>
          <p class="mx-auto mt-2 max-w-md">
            选择一个章节并运行 AI 驱动的质量评估，查看节奏、冲突和逻辑等维度的评分。
          </p>
        </div>

        <div v-else class="animate-in mx-auto max-w-4xl space-y-10">
          <!-- Header -->
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <h1 class="text-3xl text-text-primary font-bold">
                分析报告
              </h1>
              <p class="text-text-muted">
                章节 {{ chapterStore.chapters.find(c => c.id === activeReport.chapterId)?.chapterNumber }}:
                {{ chapterStore.chapters.find(c => c.id === activeReport.chapterId)?.title }}
              </p>
            </div>
            <div class="h-24 w-24 flex flex-col items-center justify-center border-4 border-primary/10 rounded-full bg-bg-surface shadow-xl">
              <span class="text-3xl font-black" :class="getScoreColor(activeReport.score)">{{ activeReport.score }}</span>
              <span class="text-[8px] text-text-muted font-bold tracking-widest uppercase">全局评分</span>
            </div>
          </div>

          <!-- Dimension Grid -->
          <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div
              v-for="dim in [
                { label: '节奏', score: activeReport.rhythmScore, icon: History },
                { label: '冲突', score: activeReport.conflictScore, icon: Flame },
                { label: '逻辑', score: activeReport.logicScore, icon: LayoutDashboard },
                { label: '人物', score: activeReport.characterScore, icon: Users },
                { label: '文风', score: activeReport.styleScore, icon: Sparkles },
              ]" :key="dim.label" class="border border-border-light rounded-2xl bg-bg-surface p-4 space-y-2"
            >
              <div class="flex items-center justify-between text-text-muted">
                <component :is="dim.icon" :size="14" />
                <span class="text-[10px] font-bold uppercase">{{ dim.label }}</span>
              </div>
              <div class="flex items-end gap-1">
                <span class="text-xl text-text-primary font-bold">{{ dim.score }}</span>
                <span class="mb-1 text-[10px] text-text-muted">/10</span>
              </div>
              <div class="h-1 overflow-hidden rounded-full bg-bg-subtle">
                <div class="h-full bg-primary" :style="{ width: `${(dim.score || 0) * 10}%` }" />
              </div>
            </div>
          </div>

          <!-- Detailed Insights -->
          <div class="grid gap-8 md:grid-cols-2">
            <section class="space-y-4">
              <h3 class="flex items-center gap-2 text-xs text-semantic-error font-bold tracking-[0.2em] uppercase">
                <AlertCircle :size="16" /> 关键问题
              </h3>
              <div class="space-y-3">
                <div v-for="(issue, idx) in parseJson(activeReport.issues)" :key="idx" class="border border-semantic-error/10 rounded-xl bg-semantic-error/5 p-4 text-sm text-text-primary leading-relaxed">
                  {{ issue }}
                </div>
              </div>
            </section>

            <section class="space-y-4">
              <h3 class="flex items-center gap-2 text-xs text-primary font-bold tracking-[0.2em] uppercase">
                <Lightbulb :size="16" /> AI 改进建议
              </h3>
              <div class="space-y-3">
                <div v-for="(sug, idx) in parseJson(activeReport.suggestions)" :key="idx" class="border border-primary/10 rounded-xl bg-primary/5 p-4 text-sm text-text-primary leading-relaxed italic">
                  "{{ sug }}"
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  </NAppLayout>
</template>

<style scoped>
.animate-in {
  animation: slide-in 0.4s ease-out both;
}
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
