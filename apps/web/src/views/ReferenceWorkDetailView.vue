<script setup lang="ts">
import type { ReferenceChapterAnalysisError } from '@ai-novel/shared'
import type { WorkAnalysisSummary } from '../api/persona'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NPanel,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  BookOpen,
  Play,
  Sparkles,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as personaApi from '../api/persona'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const workId = route.params.workId as string

const loading = ref(true)
const work = ref<any>(null)
const chapters = ref<any[]>([])
const styleReport = ref<any>(null)
const analysisSummary = ref<WorkAnalysisSummary | null>(null)
const analysisErrors = ref<ReferenceChapterAnalysisError[]>([])
const analyzing = ref(false)
const generatingReport = ref(false)
const retryingFailed = ref(false)

async function refreshWorkDetail() {
  const [workResult, chaptersResult, summaryResult, errorsResult, reportResult] = await Promise.allSettled([
    personaApi.getWork(workId),
    personaApi.listWorkChapters(workId),
    personaApi.getWorkAnalysisSummary(workId),
    personaApi.listWorkAnalysisErrors(workId),
    personaApi.getWorkStyleReport(workId),
  ])

  if (workResult.status === 'fulfilled')
    work.value = workResult.value
  if (chaptersResult.status === 'fulfilled')
    chapters.value = chaptersResult.value
  if (summaryResult.status === 'fulfilled')
    analysisSummary.value = summaryResult.value
  if (errorsResult.status === 'fulfilled')
    analysisErrors.value = errorsResult.value
  if (reportResult.status === 'fulfilled')
    styleReport.value = reportResult.value
  else
    styleReport.value = null
}

onMounted(async () => {
  try {
    await refreshWorkDetail()
    if (!work.value) {
      toast.add('作品不存在', 'error')
      router.back()
    }
  }
  catch {
    toast.add('加载作品失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function handleAnalyze() {
  analyzing.value = true
  try {
    await personaApi.analyzeWork(workId)
    await refreshWorkDetail()
    if (analysisSummary.value?.failedCount) {
      toast.add(`章节分析部分完成：成功 ${analysisSummary.value.analyzedCount} 章，失败 ${analysisSummary.value.failedCount} 章`, 'warning')
    }
    else {
      toast.add('章节分析完成', 'success')
    }
  }
  catch (e: any) {
    toast.add(e.message || '分析失败', 'error')
  }
  finally {
    analyzing.value = false
  }
}

async function handleGenerateReport() {
  generatingReport.value = true
  try {
    await refreshWorkDetail()
    styleReport.value = await personaApi.generateWorkStyleReport(workId)
    analysisSummary.value = await personaApi.getWorkAnalysisSummary(workId)
    toast.add('作品风格报告已生成', 'success')
  }
  catch (e: any) {
    toast.add(e.message || '生成报告失败', 'error')
  }
  finally {
    generatingReport.value = false
  }
}

async function handleRetryFailed() {
  retryingFailed.value = true
  try {
    const result = await personaApi.retryFailedAnalyses(workId)
    await refreshWorkDetail()
    if (result.failed > 0) {
      toast.add(`失败章节已重试：成功 ${result.analyzed} 章，仍失败 ${result.failed} 章`, 'warning')
    }
    else {
      toast.add('失败章节已全部重试成功', 'success')
    }
  }
  catch (e: any) {
    toast.add(e.message || '重试失败章节失败', 'error')
  }
  finally {
    retryingFailed.value = false
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = { uploaded: '已上传', splitting: '拆分中', analyzing: '分析中', completed: '已完成', partial_failed: '部分失败', failed: '失败' }
  return map[status] || status
}

function statusVariant(status: string) {
  if (status === 'completed')
    return 'success'
  if (status === 'failed')
    return 'error'
  if (status === 'partial_failed')
    return 'warning'
  if (status === 'analyzing' || status === 'splitting')
    return 'warning'
  return 'info'
}
</script>

<template>
  <NAppLayout project-name="作品详情">
    <template #topbar-left>
      <div class="flex items-center gap-4">
        <button class="text-text-muted hover:text-primary" @click="router.back()">
          <ArrowLeft :size="20" />
        </button>
        <div class="h-6 w-px bg-border-light" />
        <div class="flex items-center gap-2">
          <BookOpen :size="18" class="text-primary" />
          <span class="text-base text-text-primary font-semibold">{{ work?.title || '加载中...' }}</span>
        </div>
      </div>
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-2">
        <NButton
          v-if="analysisSummary?.canAnalyze"
          variant="secondary"
          size="sm"
          :loading="analyzing"
          @click="handleAnalyze"
        >
          <Play :size="14" />
          分析章节
        </NButton>
        <NButton
          v-if="analysisSummary?.canGenerateReport"
          variant="primary"
          size="sm"
          :loading="generatingReport"
          @click="handleGenerateReport"
        >
          <Sparkles :size="14" />
          生成报告
        </NButton>
        <NButton
          v-if="analysisErrors.length > 0"
          variant="secondary"
          size="sm"
          :loading="retryingFailed"
          @click="handleRetryFailed"
        >
          <Sparkles :size="14" />
          重试失败章节
        </NButton>
      </div>
    </template>

    <div class="mx-auto max-w-5xl p-8 space-y-6">
      <NLoadingState v-if="loading" />

      <template v-else-if="work">
        <!-- Work Info -->
        <NPanel title="作品信息" padding>
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <NTag :variant="statusVariant(work.status)" size="sm">
                {{ statusLabel(work.status) }}
              </NTag>
              <span class="text-xs text-text-muted">{{ work.chapterCount || 0 }} 章 · {{ work.wordCount || 0 }} 字</span>
            </div>
            <div v-if="analysisSummary" class="flex items-center gap-3 text-xs text-text-muted">
              <span>已分析 {{ analysisSummary.analyzedCount }} / {{ analysisSummary.chapterCount }} 章</span>
              <NTag v-if="analysisSummary.failedCount > 0" variant="warning" size="sm">
                {{ analysisSummary.failedCount }} 章失败
              </NTag>
            </div>
            <p v-if="analysisSummary?.hasPartialFailure" class="text-xs text-semantic-warning">
              部分章节分析失败，当前报告只会基于已成功分析的章节生成。
            </p>
          </div>
        </NPanel>

        <NPanel v-if="analysisErrors.length > 0" title="失败章节" padding>
          <div class="space-y-3">
            <div
              v-for="error in analysisErrors"
              :key="error.id"
              class="border border-semantic-warning/20 rounded-lg bg-semantic-warning/10 p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="text-sm text-text-primary font-semibold">
                  第{{ error.chapterNumber || '-' }}章 {{ error.chapterTitle || '未知章节' }}
                </div>
                <NTag variant="warning" size="sm">
                  分析失败
                </NTag>
              </div>
              <p class="mt-2 whitespace-pre-wrap text-xs text-text-secondary leading-relaxed">
                {{ error.message }}
              </p>
            </div>
          </div>
        </NPanel>

        <!-- Style Report -->
        <NPanel v-if="styleReport" title="风格报告" padding>
          <div class="space-y-4">
            <div v-if="styleReport.summary" class="border border-border-light rounded-lg bg-bg-subtle p-3">
              <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                整体概括
              </div>
              <div class="text-sm text-text-secondary leading-relaxed">
                {{ styleReport.summary }}
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div v-if="styleReport.coreAppeal" class="border border-border-light rounded-lg bg-bg-subtle p-3">
                <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                  核心爽点
                </div>
                <div class="text-sm text-text-secondary leading-relaxed">
                  {{ styleReport.coreAppeal }}
                </div>
              </div>
              <div v-if="styleReport.pacingModel" class="border border-border-light rounded-lg bg-bg-subtle p-3">
                <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                  节奏模型
                </div>
                <div class="text-sm text-text-secondary leading-relaxed">
                  {{ styleReport.pacingModel }}
                </div>
              </div>
              <div v-if="styleReport.conflictModel" class="border border-border-light rounded-lg bg-bg-subtle p-3">
                <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                  冲突模型
                </div>
                <div class="text-sm text-text-secondary leading-relaxed">
                  {{ styleReport.conflictModel }}
                </div>
              </div>
              <div v-if="styleReport.hookModel" class="border border-border-light rounded-lg bg-bg-subtle p-3">
                <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                  钩子模型
                </div>
                <div class="text-sm text-text-secondary leading-relaxed">
                  {{ styleReport.hookModel }}
                </div>
              </div>
            </div>
            <div v-if="styleReport.strengths" class="border border-border-light rounded-lg bg-bg-subtle p-3">
              <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                优点
              </div>
              <div class="text-sm text-text-secondary leading-relaxed">
                {{ styleReport.strengths }}
              </div>
            </div>
            <div v-if="styleReport.weaknesses" class="border border-border-light rounded-lg bg-bg-subtle p-3">
              <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                不足
              </div>
              <div class="text-sm text-text-secondary leading-relaxed">
                {{ styleReport.weaknesses }}
              </div>
            </div>
          </div>
        </NPanel>

        <!-- Chapters -->
        <NPanel title="章节列表" padding>
          <div v-if="chapters.length === 0" class="py-10 text-center text-sm text-text-muted">
            尚无章节数据。
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="chapter in chapters"
              :key="chapter.id"
              class="flex items-center justify-between border border-border-light rounded-lg px-4 py-3"
            >
              <div class="flex items-center gap-3">
                <span class="text-xs text-text-muted font-mono">第{{ chapter.chapterNumber }}章</span>
                <span class="text-sm text-text-primary">{{ chapter.title }}</span>
                <span class="text-xs text-text-muted">{{ chapter.wordCount }} 字</span>
              </div>
            </div>
          </div>
        </NPanel>
      </template>
    </div>
  </NAppLayout>
</template>
