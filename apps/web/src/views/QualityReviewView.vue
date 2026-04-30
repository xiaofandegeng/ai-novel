<script setup lang="ts">
import type { QualityReport } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NPanel,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Gauge,
  History,
  Sparkles,
  Target,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import {
  useChapterStore,
  useProjectStore,
} from '../stores/projects'
import { useQualityStore } from '../stores/quality.store'

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const chapterStore = useChapterStore()
const qualityStore = useQualityStore()

const loading = ref(true)
const evaluating = ref(false)
const selectedChapterId = ref('')
const reports = ref<QualityReport[]>([])
const selectedReport = ref<QualityReport | null>(null)

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      chapterStore.fetchChapters(projectId),
      fetchReports(),
    ])
    selectedChapterId.value = chapterStore.chapters[0]?.id || ''
  }
  catch {
    toast.add('加载质量评估工作台失败，请稍后重试', 'error')
  }
  finally {
    loading.value = false
  }
})

async function fetchReports() {
  await qualityStore.fetchReports(projectId)
  reports.value = qualityStore.reports
  selectedReport.value ||= reports.value[0] || null
}

async function runQualityCheck() {
  if (!selectedChapterId.value)
    return
  evaluating.value = true
  try {
    const report = await qualityStore.runQualityCheck(projectId, selectedChapterId.value)
    selectedReport.value = report
    reports.value = qualityStore.reports
    toast.add('质量报告已成功生成', 'success')
  }
  catch (error: any) {
    toast.add(error.message || '运行质量检测失败，请稍后重试', 'error')
  }
  finally {
    evaluating.value = false
  }
}

const selectedChapter = computed(() =>
  chapterStore.chapters.find(ch => ch.id === selectedChapterId.value),
)

const wordCount = computed(() => selectedChapter.value?.draft?.length || 0)
const hasEnoughText = computed(() => wordCount.value >= 100) // Lowered threshold for MVP/Mock

function dimensionScore(value?: number) {
  return (value ?? 0) * 10
}

const qualityDimensions = computed(() => {
  const r = selectedReport.value
  return [
    {
      label: '节奏密度',
      score: r ? dimensionScore(r.rhythmScore) : 0,
      description: '场景推进、信息释放与段落呼吸感。',
      icon: Gauge,
    },
    {
      label: '冲突强度',
      score: r ? dimensionScore(r.conflictScore) : 0,
      description: '人物目标、阻力与场景张力是否清晰。',
      icon: Target,
    },
    {
      label: '逻辑连续性',
      score: r ? dimensionScore(r.logicScore) : 0,
      description: '事件因果、设定约束和前后文一致性。',
      icon: CheckCircle2,
    },
    {
      label: '人物一致性',
      score: r ? dimensionScore(r.characterScore) : 0,
      description: '行为、语言和动机是否贴合人物档案。',
      icon: BookOpen,
    },
  ]
})

const overallScore = computed(() => selectedReport.value?.score || 0)

const reportIssues = computed(() => {
  if (!selectedReport.value?.issues)
    return []
  try {
    return JSON.parse(selectedReport.value.issues)
  }
  catch {
    return []
  }
})

const reportSuggestions = computed(() => {
  if (!selectedReport.value?.suggestions)
    return []
  try {
    return JSON.parse(selectedReport.value.suggestions)
  }
  catch {
    return []
  }
})

function selectReport(report: QualityReport) {
  selectedReport.value = report
  if (report.chapterId)
    selectedChapterId.value = report.chapterId
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '加载中…'">
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-3">
        <NButton variant="primary" size="sm" :disabled="!hasEnoughText || evaluating" :loading="evaluating" @click="runQualityCheck">
          <Sparkles :size="15" />
          生成质量报告
        </NButton>
      </div>
    </template>

    <div class="min-h-full bg-bg-page">
      <NLoadingState v-if="loading" />

      <div v-else class="mx-auto max-w-7xl p-8 space-y-6">
        <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div class="mb-3 flex items-center gap-2">
              <span class="h-10 w-10 flex items-center justify-center rounded-lg bg-primary-soft text-primary">
                <BarChart3 :size="22" />
              </span>
              <NTag variant="info" size="sm">
                编辑评估
              </NTag>
            </div>
            <h1 class="text-2xl text-text-primary font-bold">
              质量评估工作台
            </h1>
            <p class="mt-2 max-w-2xl text-sm text-text-secondary leading-relaxed">
              基于 AI 深度分析章节的创作质量，提供可落地的修改建议。
            </p>
          </div>

          <div class="border border-border-light rounded-lg bg-bg-surface p-4 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              综合评分
            </div>
            <div class="mt-1 flex items-end gap-2">
              <span class="text-4xl text-text-primary font-bold">{{ overallScore }}</span>
              <span class="pb-1 text-sm text-text-muted">/ 100</span>
            </div>
          </div>
        </header>

        <div class="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div class="space-y-6">
            <NPanel title="章节选择" description="选择正文样本" padding>
              <div v-if="chapterStore.chapters.length === 0" class="py-10 text-center text-sm text-text-muted">
                暂无章节。
              </div>
              <div v-else class="space-y-2">
                <button
                  v-for="chapter in chapterStore.chapters"
                  :key="chapter.id"
                  class="w-full border rounded-lg p-3 text-left transition-colors"
                  :class="selectedChapterId === chapter.id
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border-light bg-bg-surface text-text-secondary hover:bg-bg-subtle'"
                  @click="selectedChapterId = chapter.id"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">
                        {{ chapter.chapterNumber }}. {{ chapter.title }}
                      </div>
                      <div class="mt-1 text-xs opacity-75">
                        {{ chapter.draft?.length || 0 }} 字
                      </div>
                    </div>
                    <ChevronRight :size="15" />
                  </div>
                </button>
              </div>
            </NPanel>

            <NPanel title="历史报告" description="过往评估记录" padding>
              <div v-if="reports.length === 0" class="py-10 text-center text-sm text-text-muted">
                尚无评估历史。
              </div>
              <div v-else class="space-y-2">
                <button
                  v-for="report in reports"
                  :key="report.id"
                  class="w-full border rounded-lg p-3 text-left transition-colors"
                  :class="selectedReport?.id === report.id
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border-light bg-bg-surface text-text-secondary hover:bg-bg-subtle'"
                  @click="selectReport(report)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-bold uppercase opacity-60">
                        {{ new Date(report.createdAt).toLocaleDateString() }}
                      </div>
                      <div class="mt-1 truncate text-sm font-semibold">
                        得分: {{ report.score }}
                      </div>
                    </div>
                    <History :size="15" class="opacity-40" />
                  </div>
                </button>
              </div>
            </NPanel>
          </div>

          <div class="space-y-6">
            <NPanel title="评估维度" :description="selectedChapter ? `针对第 ${selectedChapter.chapterNumber} 章的分析结果` : '未选择报告'" padding>
              <div v-if="!selectedReport" class="py-20 text-center text-text-muted">
                点击上方“生成质量报告”开启 AI 诊断
              </div>
              <template v-else>
                <div v-if="!hasEnoughText" class="mb-5 flex items-start gap-3 border border-semantic-warning/20 rounded-lg bg-semantic-warning/10 p-4">
                  <AlertTriangle :size="18" class="mt-0.5 text-semantic-warning" />
                  <div>
                    <div class="text-sm text-text-primary font-semibold">
                      正文样本偏短
                    </div>
                    <p class="mt-1 text-sm text-text-secondary">
                      建议正文超过 500 字，目前仅 {{ wordCount }} 字。评估结果可能不准确。
                    </p>
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div
                    v-for="item in qualityDimensions"
                    :key="item.label"
                    class="border border-border-light rounded-lg bg-bg-subtle/60 p-4"
                  >
                    <div class="mb-4 flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="h-9 w-9 flex items-center justify-center rounded-lg bg-bg-surface text-primary">
                          <component :is="item.icon" :size="18" />
                        </span>
                        <div class="text-sm text-text-primary font-semibold">
                          {{ item.label }}
                        </div>
                      </div>
                      <span class="text-xl text-text-primary font-bold">{{ item.score }}</span>
                    </div>
                    <div class="mb-3 h-2 overflow-hidden rounded-full bg-bg-muted">
                      <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${item.score}%` }" />
                    </div>
                    <p class="text-xs text-text-secondary leading-relaxed">
                      {{ item.description }}
                    </p>
                  </div>
                </div>

                <div class="grid mt-8 gap-6 md:grid-cols-2">
                  <div class="space-y-4">
                    <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold">
                      <AlertTriangle :size="16" class="text-semantic-error" /> 潜在问题
                    </h3>
                    <ul class="space-y-2">
                      <li v-for="(issue, idx) in reportIssues" :key="idx" class="border border-border-light rounded-lg bg-bg-surface p-3 text-sm text-text-secondary">
                        {{ issue }}
                      </li>
                    </ul>
                  </div>
                  <div class="space-y-4">
                    <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold">
                      <Sparkles :size="16" class="text-primary" /> 修订建议
                    </h3>
                    <ul class="space-y-2">
                      <li v-for="(sug, idx) in reportSuggestions" :key="idx" class="border border-border-light rounded-lg bg-bg-surface p-3 text-sm text-text-secondary">
                        {{ sug }}
                      </li>
                    </ul>
                  </div>
                </div>
              </template>
            </NPanel>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
