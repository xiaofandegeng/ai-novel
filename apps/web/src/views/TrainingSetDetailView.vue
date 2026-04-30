<script setup lang="ts">
import type { ReferenceWork } from '@ai-novel/shared'
import type { WorkAnalysisSummary } from '../api/persona'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NModal,
  NPanel,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  BookOpen,
  Eye,
  FileText,
  Layers,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as personaApi from '../api/persona'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const trainingSetId = route.params.id as string

const loading = ref(true)
const trainingSet = ref<any>(null)
const works = ref<ReferenceWork[]>([])
const workAnalysisSummaryMap = ref<Record<string, WorkAnalysisSummary>>({})

const showUpload = ref(false)
const uploadTitle = ref('')
const uploadContent = ref('')
const uploading = ref(false)
const analyzingWorkId = ref<string | null>(null)
const generatingReportWorkId = ref<string | null>(null)
const generatingPersona = ref(false)
const showGeneratePersona = ref(false)
const showPersonaConfirm = ref(false)
const personaName = ref('')

onMounted(async () => {
  try {
    trainingSet.value = await personaApi.getTrainingSet(trainingSetId)
    await refreshWorks()
  }
  catch {
    toast.add('加载训练集失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function refreshWorks() {
  works.value = await personaApi.listWorks(trainingSetId)
  const summaries = await Promise.allSettled(
    works.value.map(w => personaApi.getWorkAnalysisSummary(w.id)),
  )
  const map: Record<string, WorkAnalysisSummary> = {}
  summaries.forEach((r, i) => {
    if (r.status === 'fulfilled')
      map[works.value[i].id] = r.value
  })
  workAnalysisSummaryMap.value = map
}

async function handleUpload() {
  if (!uploadTitle.value.trim() || !uploadContent.value.trim())
    return
  uploading.value = true
  try {
    const work = await personaApi.createWork(trainingSetId, {
      title: uploadTitle.value.trim(),
      sourceType: 'webnovel',
    })
    await personaApi.splitWork(work.id, uploadContent.value)
    await refreshWorks()
    showUpload.value = false
    uploadTitle.value = ''
    uploadContent.value = ''
    toast.add('作品上传并拆分成功', 'success')
  }
  catch {
    toast.add('上传失败', 'error')
  }
  finally {
    uploading.value = false
  }
}

async function handleAnalyze(workId: string) {
  analyzingWorkId.value = workId
  try {
    const result = await personaApi.analyzeWork(workId)
    await refreshWorks()
    if (result.errors.length > 0) {
      toast.add(`章节分析部分完成：成功 ${result.analyzed} 章，失败 ${result.errors.length} 章`, 'warning')
    }
    else {
      toast.add('章节分析完成', 'success')
    }
  }
  catch {
    toast.add('分析失败', 'error')
  }
  finally {
    analyzingWorkId.value = null
  }
}

async function handleGenerateReport(workId: string) {
  generatingReportWorkId.value = workId
  try {
    await personaApi.generateWorkStyleReport(workId)
    await refreshWorks()
    toast.add('作品风格报告已生成', 'success')
  }
  catch (e: any) {
    toast.add(e.message || '生成报告失败', 'error')
  }
  finally {
    generatingReportWorkId.value = null
  }
}

async function handleDeleteWork(workId: string) {
  try {
    await personaApi.deleteWork(workId)
    works.value = works.value.filter(w => w.id !== workId)
    toast.add('作品已删除', 'success')
  }
  catch {
    toast.add('删除失败', 'error')
  }
}

function handleGeneratePersonaClick() {
  const hasReport = Object.values(workAnalysisSummaryMap.value).some(s => s.hasReport)
  if (!hasReport) {
    toast.add('训练集中尚无作品风格报告，请先分析作品并生成报告', 'warning')
    return
  }
  const hasUnfinished = Object.values(workAnalysisSummaryMap.value).some(s => !s.hasReport && s.chapterCount > 0)
  if (hasUnfinished) {
    showPersonaConfirm.value = true
    return
  }
  showGeneratePersona.value = true
}

async function handleGeneratePersona() {
  if (!personaName.value.trim())
    return
  generatingPersona.value = true
  try {
    const persona = await personaApi.generatePersonaFromTrainingSet(trainingSetId, { name: personaName.value.trim() })
    showGeneratePersona.value = false
    personaName.value = ''
    toast.add('写作人格已生成', 'success')
    router.push(`/persona/${persona.id}`)
  }
  catch (e: any) {
    toast.add(e.message || '生成人格失败', 'error')
  }
  finally {
    generatingPersona.value = false
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
  <NAppLayout project-name="训练集详情">
    <template #topbar-left>
      <div class="flex items-center gap-4">
        <button class="text-text-muted hover:text-primary" @click="router.push('/persona')">
          <ArrowLeft :size="20" />
        </button>
        <div class="h-6 w-px bg-border-light" />
        <div class="flex items-center gap-2">
          <Layers :size="18" class="text-primary" />
          <span class="text-base text-text-primary font-semibold">{{ trainingSet?.name || '加载中...' }}</span>
        </div>
      </div>
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-2">
        <NButton variant="secondary" size="sm" @click="showUpload = true">
          <Plus :size="15" />
          上传作品
        </NButton>
        <NButton variant="primary" size="sm" @click="handleGeneratePersonaClick">
          <Sparkles :size="15" />
          生成人格
        </NButton>
      </div>
    </template>

    <div class="mx-auto max-w-5xl p-8 space-y-6">
      <NLoadingState v-if="loading" />

      <template v-else>
        <NPanel title="参考作品" padding>
          <div v-if="works.length === 0" class="py-10 text-center text-sm text-text-muted">
            尚无参考作品。点击"上传作品"添加优秀网文。
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="work in works"
              :key="work.id"
              class="flex items-center justify-between border border-border-light rounded-lg p-4"
            >
              <div class="flex items-center gap-3">
                <div class="h-9 w-9 flex items-center justify-center rounded-lg bg-bg-subtle text-primary">
                  <BookOpen :size="18" />
                </div>
                <div>
                  <div class="text-sm text-text-primary font-semibold">
                    {{ work.title }}
                  </div>
                  <div class="text-xs text-text-muted">
                    {{ work.chapterCount || 0 }} 章
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <NTag :variant="statusVariant(work.status)" size="sm">
                  {{ statusLabel(work.status) }}
                </NTag>
                <NTag
                  v-if="workAnalysisSummaryMap[work.id]?.failedCount"
                  variant="warning"
                  size="sm"
                >
                  {{ workAnalysisSummaryMap[work.id].failedCount }} 章失败
                </NTag>
                <NTag
                  v-if="workAnalysisSummaryMap[work.id]?.hasPartialFailure"
                  variant="warning"
                  size="sm"
                >
                  部分章节分析失败
                </NTag>
                <!-- Step 1: Analyze chapters (when split done but no analyses yet) -->
                <NButton
                  v-if="workAnalysisSummaryMap[work.id]?.canAnalyze"
                  variant="ghost"
                  size="sm"
                  :loading="analyzingWorkId === work.id"
                  @click="handleAnalyze(work.id)"
                >
                  <Play :size="14" />
                  分析章节
                </NButton>
                <!-- Step 2: Generate report (when analyzed but no report yet) -->
                <NButton
                  v-if="workAnalysisSummaryMap[work.id]?.canGenerateReport"
                  variant="ghost"
                  size="sm"
                  :loading="generatingReportWorkId === work.id"
                  @click="handleGenerateReport(work.id)"
                >
                  <Sparkles :size="14" />
                  生成报告
                </NButton>
                <span
                  v-if="workAnalysisSummaryMap[work.id]?.canGenerateReport && workAnalysisSummaryMap[work.id]?.failedCount"
                  class="text-xs text-semantic-warning"
                >
                  报告将基于已成功分析的章节生成。
                </span>
                <!-- Step 3: View report -->
                <NButton
                  v-if="workAnalysisSummaryMap[work.id]?.hasReport"
                  variant="ghost"
                  size="sm"
                  @click="router.push(`/persona/work/${work.id}`)"
                >
                  <Eye :size="14" />
                  查看报告
                </NButton>
                <NButton variant="ghost" size="sm" @click="router.push(`/persona/work/${work.id}`)">
                  <FileText :size="14" />
                  详情
                </NButton>
                <button class="p-1 text-text-muted hover:text-semantic-error" @click="handleDeleteWork(work.id)">
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </NPanel>
      </template>
    </div>

    <NModal v-model="showUpload" title="上传参考作品">
      <form class="space-y-4" @submit.prevent="handleUpload">
        <div>
          <label class="mb-1 block text-sm text-text-secondary font-medium">作品标题</label>
          <input v-model="uploadTitle" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm" placeholder="作品名称">
        </div>
        <div>
          <label class="mb-1 block text-sm text-text-secondary font-medium">作品文本内容</label>
          <textarea v-model="uploadContent" rows="8" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm" placeholder="粘贴作品全文..." />
        </div>
        <div class="flex justify-end gap-2">
          <NButton variant="ghost" size="sm" @click="showUpload = false">
            取消
          </NButton>
          <NButton variant="primary" size="sm" :disabled="!uploadTitle.trim() || !uploadContent.trim() || uploading" :loading="uploading" @click="handleUpload">
            上传并拆分
          </NButton>
        </div>
      </form>
    </NModal>

    <NModal v-model="showGeneratePersona" title="生成写作人格">
      <form class="space-y-4" @submit.prevent="handleGeneratePersona">
        <p class="text-sm text-text-secondary">
          将基于该训练集所有作品的风格报告融合生成一个写作人格。
        </p>
        <div>
          <label class="mb-1 block text-sm text-text-secondary font-medium">人格名称</label>
          <input v-model="personaName" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm" placeholder="例如：都市高压反杀型">
        </div>
        <div class="flex justify-end gap-2">
          <NButton variant="ghost" size="sm" @click="showGeneratePersona = false">
            取消
          </NButton>
          <NButton variant="ai" size="sm" :disabled="!personaName.trim() || generatingPersona" :loading="generatingPersona" @click="handleGeneratePersona">
            生成人格
          </NButton>
        </div>
      </form>
    </NModal>

    <NModal v-model="showPersonaConfirm" title="确认生成人格">
      <div class="space-y-4">
        <p class="text-sm text-text-secondary">
          仍有参考作品未生成风格报告，当前人格只会基于已完成报告生成。是否继续？
        </p>
        <div class="flex justify-end gap-2">
          <NButton variant="ghost" size="sm" @click="showPersonaConfirm = false">
            取消
          </NButton>
          <NButton variant="primary" size="sm" @click="showPersonaConfirm = false; showGeneratePersona = true">
            继续生成
          </NButton>
        </div>
      </div>
    </NModal>
  </NAppLayout>
</template>
