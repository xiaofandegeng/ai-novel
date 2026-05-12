<script setup lang="ts">
import type { SuggestionType } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  XCircle,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import {
  useChapterStore,
  usePostprocessSuggestionStore,
  useProjectStore,
} from '../stores/projects'

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const chapterStore = useChapterStore()
const suggestionStore = usePostprocessSuggestionStore()

const loading = ref(true)
const selectedChapterId = ref<string | null>(null)

const typeLabels: Record<SuggestionType, string> = {
  fact_triple: '事实三元组',
  foreshadowing_add: '新增伏笔',
  foreshadowing_payoff: '伏笔回收',
  chapter_element: '章节元素',
  character_state: '人物状态',
  continuity_note: '连续性提示',
  style_note: '风格记录',
}

const typeVariants: Record<SuggestionType, 'info' | 'warning' | 'success' | 'ai' | 'default' | 'primary'> = {
  fact_triple: 'info',
  foreshadowing_add: 'warning',
  foreshadowing_payoff: 'success',
  chapter_element: 'primary',
  character_state: 'ai',
  continuity_note: 'default',
  style_note: 'default',
}

const groupedByType = computed(() => {
  const groups: Record<string, typeof suggestionStore.suggestions> = {}
  for (const s of suggestionStore.suggestions) {
    if (!groups[s.suggestionType])
      groups[s.suggestionType] = []
    groups[s.suggestionType].push(s)
  }
  return groups
})

function parsePayload(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload)
  }
  catch {
    return { title: '无法解析建议内容' }
  }
}

function suggestionTitle(item: typeof suggestionStore.suggestions[0]): string {
  const data = parsePayload(item.payload)
  return (data.title as string) || (data.subjectName as string) || (data.characterName as string) || item.payload.slice(0, 60)
}

function inferenceLabel(rule: unknown): string {
  if (rule === 'co_occurrence')
    return '共场推理'
  if (rule === 'transitive')
    return '传递推理'
  return '图谱推理'
}

function inferenceDetails(item: typeof suggestionStore.suggestions[0]) {
  const data = parsePayload(item.payload)
  const sourceFacts = Array.isArray(data.sourceFacts)
    ? data.sourceFacts.filter((fact): fact is string => typeof fact === 'string')
    : []
  const sourceTripleIds = Array.isArray(data.sourceTripleIds)
    ? data.sourceTripleIds.filter((id): id is string => typeof id === 'string')
    : []
  const sourceElementIds = Array.isArray(data.sourceElementIds)
    ? data.sourceElementIds.filter((id): id is string => typeof id === 'string')
    : []

  if (!data.inferenceRule && sourceFacts.length === 0 && sourceTripleIds.length === 0 && sourceElementIds.length === 0)
    return null

  return {
    rule: inferenceLabel(data.inferenceRule),
    reason: typeof data.reason === 'string' ? data.reason : item.reason,
    sourceFacts,
    sourceTripleIds,
    sourceElementIds,
  }
}

const acceptedCount = computed(() =>
  suggestionStore.suggestions.filter(s => s.status === 'accepted').length,
)

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      chapterStore.fetchChapters(projectId),
    ])
    if (chapterStore.chapters.length > 0) {
      await selectChapter(chapterStore.chapters[0].id)
    }
  }
  catch {
    toast.add('加载数据失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function selectChapter(id: string) {
  selectedChapterId.value = id
  try {
    await suggestionStore.fetchSuggestions(projectId, id)
  }
  catch {
    toast.add('加载建议失败', 'error')
  }
}

async function handleAccept(id: string) {
  try {
    await suggestionStore.accept(projectId, id)
    toast.add('已接受', 'success')
  }
  catch {
    toast.add('操作失败', 'error')
  }
}

async function handleReject(id: string) {
  try {
    await suggestionStore.reject(projectId, id)
    toast.add('已拒绝', 'success')
  }
  catch {
    toast.add('操作失败', 'error')
  }
}

async function handleApplyAccepted() {
  if (!selectedChapterId.value)
    return
  try {
    const result = await suggestionStore.applyAccepted(projectId, selectedChapterId.value)
    const parts: string[] = []
    if (result.applied)
      parts.push(`已应用 ${result.applied} 条`)
    if (result.acknowledged)
      parts.push(`已记录 ${result.acknowledged} 条`)
    if (result.failed)
      parts.push(`失败 ${result.failed} 条`)
    if (result.skipped)
      parts.push(`跳过 ${result.skipped} 条`)
    const hasProblem = result.failed > 0 || result.skipped > 0
    toast.add(parts.join('，') || '没有需要处理的建议', hasProblem ? 'warning' : 'success')
  }
  catch {
    toast.add('批量应用失败', 'error')
  }
}

async function handleRunInference() {
  try {
    const result = await suggestionStore.runInference(projectId)
    toast.add(`推理完成，新增 ${result.suggestionsCreated} 条建议`, 'success')
    if (selectedChapterId.value)
      await suggestionStore.fetchSuggestions(projectId, selectedChapterId.value)
  }
  catch {
    toast.add('推理失败', 'error')
  }
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

    <div class="h-full overflow-y-auto p-6">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-lg text-text-primary font-bold">
            章后分析
          </h1>
          <p class="text-sm text-text-muted">
            审查 AI 提取的结构化变更，确认后写入知识库
          </p>
        </div>
        <div class="flex gap-2">
          <NButton variant="ghost" size="sm" @click="handleRunInference">
            <Lightbulb :size="14" class="mr-1" /> 运行推理
          </NButton>
          <NButton
            variant="primary"
            size="sm"
            :disabled="acceptedCount === 0"
            @click="handleApplyAccepted"
          >
            批量应用已接受 ({{ acceptedCount }})
          </NButton>
        </div>
      </div>

      <div class="mb-4 flex gap-2">
        <select
          class="border border-border-light rounded-md bg-bg-surface px-3 py-1.5 text-sm"
          @change="selectChapter(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            选择章节
          </option>
          <option
            v-for="ch in chapterStore.chapters"
            :key="ch.id"
            :value="ch.id"
            :selected="ch.id === selectedChapterId"
          >
            第{{ ch.chapterNumber }}章: {{ ch.title }}
          </option>
        </select>
      </div>

      <NLoadingState v-if="loading" />
      <div v-else-if="!selectedChapterId" class="py-12 text-center text-text-muted">
        <ClipboardList :size="32" class="mx-auto mb-3 opacity-40" />
        <p class="text-sm">
          请选择一个章节查看分析结果
        </p>
      </div>
      <div v-else-if="suggestionStore.suggestions.length === 0" class="py-12 text-center text-text-muted">
        <ClipboardList :size="32" class="mx-auto mb-3 opacity-40" />
        <p class="text-sm">
          本章暂无分析建议
        </p>
      </div>
      <div v-else class="space-y-6">
        <div v-for="(items, type) in groupedByType" :key="type">
          <div class="mb-2 flex items-center gap-2">
            <NTag :variant="typeVariants[type as SuggestionType]" size="sm">
              {{ typeLabels[type as SuggestionType] }}
            </NTag>
            <span class="text-xs text-text-muted">{{ items.length }} 条</span>
          </div>
          <div class="space-y-2">
            <div
              v-for="item in items"
              :key="item.id"
              class="flex items-center justify-between border border-border-light rounded-lg bg-bg-surface p-3"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-text-primary">
                  {{ suggestionTitle(item) }}
                </p>
                <p class="text-xs text-text-muted">
                  置信度: {{ item.confidence }}%{{ item.reason ? ` · ${item.reason}` : '' }}
                </p>
                <div
                  v-if="inferenceDetails(item)"
                  class="mt-2 border border-ai/10 rounded-md bg-ai-soft/40 px-3 py-2 text-xs text-text-secondary"
                >
                  <div class="mb-1 flex items-center gap-2 text-ai font-semibold">
                    <Lightbulb :size="12" />
                    {{ inferenceDetails(item)?.rule }}
                  </div>
                  <p v-if="inferenceDetails(item)?.reason" class="mb-1 leading-relaxed">
                    {{ inferenceDetails(item)?.reason }}
                  </p>
                  <div v-if="inferenceDetails(item)?.sourceFacts.length" class="space-y-1">
                    <div class="text-[10px] text-text-muted font-bold">
                      来源事实
                    </div>
                    <ul class="list-disc pl-4 leading-relaxed">
                      <li v-for="fact in inferenceDetails(item)?.sourceFacts" :key="fact">
                        {{ fact }}
                      </li>
                    </ul>
                  </div>
                  <div
                    v-if="inferenceDetails(item)?.sourceTripleIds.length || inferenceDetails(item)?.sourceElementIds.length"
                    class="mt-1 text-[10px] text-text-muted"
                  >
                    来源 ID：
                    <span v-if="inferenceDetails(item)?.sourceTripleIds.length">
                      triples {{ inferenceDetails(item)?.sourceTripleIds.join(', ') }}
                    </span>
                    <span v-if="inferenceDetails(item)?.sourceElementIds.length">
                      elements {{ inferenceDetails(item)?.sourceElementIds.join(', ') }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="ml-3 flex shrink-0 items-center gap-2">
                <NTag
                  :variant="item.status === 'pending' ? 'info' : item.status === 'accepted' ? 'success' : item.status === 'applied' ? 'primary' : item.status === 'acknowledged' ? 'ai' : item.status === 'apply_failed' ? 'error' : 'default'"
                  size="sm"
                >
                  {{ item.status === 'pending' ? '待确认' : item.status === 'accepted' ? '已接受' : item.status === 'applied' ? '已应用' : item.status === 'acknowledged' ? '已记录' : item.status === 'apply_failed' ? '应用失败' : '已拒绝' }}
                </NTag>
                <template v-if="item.status === 'pending'">
                  <NButton variant="ghost" size="sm" class="text-green-600 hover:text-green-700" @click="handleAccept(item.id)">
                    <CheckCircle2 :size="14" />
                  </NButton>
                  <NButton variant="ghost" size="sm" class="text-red-400 hover:text-red-500" @click="handleReject(item.id)">
                    <XCircle :size="14" />
                  </NButton>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
