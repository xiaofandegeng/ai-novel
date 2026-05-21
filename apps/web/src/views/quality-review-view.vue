<script setup lang="ts">
import type { QualityReport } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NPanel,
  useToast,
} from '@ai-novel/ui'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Gauge,
  PenTool,
  Sparkles,
  Target,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import QualityDimensionGrid from '../features/quality/components/quality-dimension-grid.vue'
import QualityReportHistory from '../features/quality/components/quality-report-history.vue'
import QualityReportSummary from '../features/quality/components/quality-report-summary.vue'
import { useChapterStore } from '../stores/chapter.store'
import { useProjectStore } from '../stores/project.store'
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
const hasEnoughText = computed(() => wordCount.value >= 500)

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
    {
      label: '文风评分',
      score: r ? dimensionScore(r.styleScore) : 0,
      description: '用词准确度、句式多样性与文字感染力。',
      icon: PenTool,
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
        <QualityReportSummary :overall-score="overallScore" />

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

            <QualityReportHistory
              :reports="reports"
              :selected-report-id="selectedReport?.id || null"
              @select="selectReport"
            />
          </div>

          <div class="space-y-6">
            <NPanel title="评估维度" :description="selectedChapter ? `针对第 ${selectedChapter.chapterNumber} 章的分析结果` : '未选择报告'" padding>
              <div v-if="!selectedReport" class="py-20 text-center text-text-muted">
                点击上方“生成质量报告”开启 AI 诊断
              </div>
              <QualityDimensionGrid
                v-else
                :dimensions="qualityDimensions"
                :issues="reportIssues"
                :suggestions="reportSuggestions"
                :has-enough-text="hasEnoughText"
                :word-count="wordCount"
              />
            </NPanel>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
