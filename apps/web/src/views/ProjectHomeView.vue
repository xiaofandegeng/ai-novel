<script setup lang="ts">
import type { WritingGoalProgress } from '@ai-novel/shared'
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
  BookText,
  CheckCircle2,
  ChevronRight,
  Download,
  PenLine,
  Sparkles,
  TrendingUp,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb.vue'
import { exportProject } from '../api/export'
import { fetchAISettings } from '../api/settings'
import * as goalsApi from '../api/writing-goals'
import AppSidebar from '../components/AppSidebar.vue'
import WritingGoalPanel from '../features/writing/components/WritingGoalPanel.vue'
import { useChapterStore } from '../stores/chapter.store'
import { useCharacterStore } from '../stores/character.store'
import { useProjectStore } from '../stores/project.store'
import { useStoryBibleStore } from '../stores/story-bible.store'
import { useVolumeStore } from '../stores/volume.store'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const characterStore = useCharacterStore()
const volumeStore = useVolumeStore()
const chapterStore = useChapterStore()
const storyBibleStore = useStoryBibleStore()

const loading = ref(true)
const aiConfigured = ref(false)
const goalProgress = ref<WritingGoalProgress | null>(null)
const todayStats = ref<{ wordsAdded: number, aiWordsAccepted: number, manualWordsAdded: number } | null>(null)

async function refreshWritingGoals() {
  const goals = await goalsApi.fetchActiveGoals(projectId)
  if (goals.length > 0) {
    goalProgress.value = await goalsApi.fetchGoalProgress(projectId, goals[0].id)
  }
  else {
    goalProgress.value = null
  }

  const today = new Date().toISOString().slice(0, 10)
  const stats = await goalsApi.fetchDailyStats(projectId, today, today)
  todayStats.value = stats.length > 0
    ? {
        wordsAdded: stats[0].wordsAdded,
        aiWordsAccepted: stats[0].aiWordsAccepted,
        manualWordsAdded: stats[0].manualWordsAdded,
      }
    : null
}

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
      volumeStore.fetchVolumes(projectId),
      chapterStore.fetchChapters(projectId),
      storyBibleStore.fetchStoryBible(projectId),
    ])
    try {
      const aiSettings = await fetchAISettings()
      aiConfigured.value = aiSettings.hasApiKey
    }
    catch {
      aiConfigured.value = false
      toast.add('AI 配置状态读取失败，可前往项目设置重新检测', 'warning')
    }
    // Load writing goal progress
    try {
      await refreshWritingGoals()
    }
    catch {
      // Goals not available yet, silently ignore
    }
  }
  catch {
    toast.add('加载项目数据失败，请稍后重试', 'error')
    router.push('/')
  }
  finally {
    loading.value = false
  }
})

const lastEditedChapter = computed(() => {
  if (chapterStore.chapters.length === 0)
    return null
  return [...chapterStore.chapters].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0]
})

const totalWords = computed(() => {
  return chapterStore.chapters.reduce((sum: number, ch) => sum + (ch.draft?.length || 0), 0)
})

const progressPercent = computed(() => {
  if (!projectStore.currentProject?.targetWords)
    return 0
  return Math.min(100, Math.floor((totalWords.value / projectStore.currentProject.targetWords) * 100))
})

const isExporting = ref(false)
async function handleExport() {
  isExporting.value = true
  try {
    await exportProject(projectId)
    toast.add('项目导出成功！', 'success')
  }
  catch {
    toast.add('导出失败，请稍后重试', 'error')
  }
  finally {
    isExporting.value = false
  }
}

async function handleSetWritingGoal() {
  try {
    const existing = await goalsApi.fetchActiveGoals(projectId)
    if (existing.length > 0) {
      toast.add('当前已有进行中的写作目标', 'info')
      await refreshWritingGoals()
      return
    }

    const targetWords = Math.max(1000, Math.round((projectStore.currentProject?.targetWords || 100000) / 100))
    await goalsApi.createGoal(projectId, {
      goalType: 'daily_words',
      targetWords,
      startDate: new Date().toISOString().slice(0, 10),
      status: 'active',
    })
    await refreshWritingGoals()
    toast.add(`已创建每日 ${targetWords.toLocaleString()} 字目标`, 'success')
  }
  catch {
    toast.add('写作目标创建失败，请稍后重试', 'error')
  }
}

const showAISuggestion = ref(true)

const readinessItems = computed(() => {
  const bible = storyBibleStore.storyBible
  const hasBible = Boolean(
    bible?.worldview
    || bible?.mainConflict
    || bible?.theme
    || bible?.rules,
  )
  const hasOutline = chapterStore.chapters.length > 0
  const hasDraftableChapter = chapterStore.chapters.some(ch => ch.status !== 'completed')

  return [
    {
      id: 'ai',
      label: 'AI 服务配置',
      ready: aiConfigured.value,
      description: aiConfigured.value ? '已配置 API Key，可进行生成和分析。' : '未配置 API Key，AI 生成、拆书和质量评估不可用。',
      actionLabel: '去配置',
      route: `/project/${projectId}/settings`,
    },
    {
      id: 'bible',
      label: '故事设定',
      ready: hasBible,
      description: hasBible ? '已有故事背景约束，AI 能读取基础设定。' : '建议先填写世界观、主冲突或核心规则。',
      actionLabel: '补充设定',
      route: `/project/${projectId}/bible`,
    },
    {
      id: 'characters',
      label: '角色档案',
      ready: characterStore.characters.length > 0,
      description: characterStore.characters.length > 0 ? `已有 ${characterStore.characters.length} 个角色。` : '至少创建主角、对手或关键配角。',
      actionLabel: '创建角色',
      route: `/project/${projectId}/characters`,
    },
    {
      id: 'outline',
      label: '分卷与章节',
      ready: volumeStore.volumes.length > 0 && hasOutline,
      description: hasOutline ? `已有 ${chapterStore.chapters.length} 个章节，可进入写作。` : '建议先建立第一卷和第一章。',
      actionLabel: '规划大纲',
      route: `/project/${projectId}/outline`,
    },
    {
      id: 'writing',
      label: '可写章节',
      ready: hasDraftableChapter,
      description: hasDraftableChapter ? '存在可继续写作的章节。' : '当前章节均已完成，可新增下一章。',
      actionLabel: hasDraftableChapter ? '开始写作' : '新增章节',
      route: hasDraftableChapter ? `/project/${projectId}/write` : `/project/${projectId}/outline`,
    },
  ]
})

const readyCount = computed(() => readinessItems.value.filter(item => item.ready).length)
const canStartWriting = computed(() => readyCount.value >= 4)

function handleExploreCharacters() {
  router.push(`/project/${projectId}/characters`)
  toast.add('正在为您前往角色库，您可以使用右侧 AI 助手进行构思', 'info')
}
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中…'"
    :project-id="projectId"
  >
    <template #topbar-left>
      <ProjectBreadcrumb
        :title="projectStore.currentProject?.title"
        title-fallback="加载中…"
        back-to="/"
      />
    </template>

    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5 border border-border-light rounded-full bg-bg-subtle px-3 py-1 text-xs text-text-secondary">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-semantic-success" />
          已自动保存
        </div>
        <NButton variant="ghost" size="sm" :loading="isExporting" @click="handleExport">
          <Download :size="16" class="mr-1.5" /> 导出项目
        </NButton>
        <NButton variant="primary" size="sm" @click="router.push(`/project/${projectId}/write`)">
          <PenLine :size="16" class="mr-1.5" /> 继续写作
        </NButton>
      </div>
    </template>

    <div class="mx-auto max-w-5xl p-8 space-y-8">
      <NLoadingState v-if="loading" />

      <template v-else>
        <!-- Welcome Banner / Header -->
        <div class="flex items-end justify-between gap-4">
          <div>
            <div class="mb-2 flex items-center gap-2">
              <NTag variant="ai" size="sm">
                {{ projectStore.currentProject?.status }}
              </NTag>
              <span class="text-xs text-text-muted">ID: {{ projectId }}</span>
            </div>
            <h1 class="text-3xl text-text-primary font-bold tracking-tight">
              仪表盘
            </h1>
          </div>
          <div class="text-right">
            <div class="text-2xl text-text-primary font-bold">
              {{ totalWords.toLocaleString() }}
            </div>
            <div class="text-xs text-text-muted font-semibold tracking-wider uppercase">
              已创作字数
            </div>
          </div>
        </div>

        <!-- Quick Actions & Stats -->
        <div class="grid gap-6 md:grid-cols-3">
          <!-- Continue Writing Card -->
          <div
            class="group relative cursor-pointer overflow-hidden rounded-xl bg-primary p-6 text-white shadow-sm md:col-span-2"
            @click="router.push(`/project/${projectId}/write`)"
          >
            <div class="relative z-10">
              <h3 class="mb-2 text-lg font-bold">
                准备好创作第 {{ lastEditedChapter ? lastEditedChapter.chapterNumber : 1 }} 章了吗？
              </h3>
              <p class="mb-6 max-w-sm text-sm text-primary-soft">
                {{ lastEditedChapter
                  ? `上次编辑：“${lastEditedChapter.title}” - ${lastEditedChapter.draft?.length || 0} 字`
                  : '今天就开始创作你的第一章吧。'
                }}
              </p>
              <NButton variant="secondary" size="md" class="border-none bg-white text-primary hover:bg-bg-page">
                打开编辑器 <ChevronRight :size="16" class="ml-1" />
              </NButton>
            </div>
            <PenLine class="absolute rotate-12 opacity-10 transition-transform -bottom-4 -right-4 group-hover:scale-110" :size="160" />
          </div>

          <!-- Progress Card -->
          <div class="flex flex-col justify-between border border-border-light rounded-xl bg-bg-surface p-6">
            <div>
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-sm text-text-primary font-bold">
                  整体进度
                </h3>
                <TrendingUp :size="18" class="text-primary" />
              </div>
              <div class="mb-2 flex items-end gap-2">
                <span class="text-2xl text-text-primary font-bold">{{ progressPercent }}%</span>
                <span class="mb-1 pb-1 text-xs text-text-muted">总目标 {{ (projectStore.currentProject?.targetWords || 0).toLocaleString() }} 字</span>
              </div>
              <div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-bg-page">
                <div class="h-full bg-primary transition-all duration-1000" :style="{ width: `${progressPercent}%` }" />
              </div>
            </div>
            <p class="text-xs text-text-muted italic">
              “千里之行，始于足下。”
            </p>
          </div>
        </div>

        <!-- Overview Sections -->
        <div class="grid gap-6 md:grid-cols-2">
          <!-- Writing Goals -->
          <WritingGoalPanel
            :progress="goalProgress"
            :today-stats="todayStats"
            :loading="loading"
            @set-goal="handleSetWritingGoal"
          />

          <NPanel
            title="开写前检查"
            :description="canStartWriting ? '核心配置已经就绪，可以进入正文写作。' : '先补齐关键配置，AI 才能稳定遵守设定和写作方向。'"
            padding
          >
            <template #actions>
              <NTag :variant="canStartWriting ? 'success' : 'warning'" size="sm">
                {{ readyCount }} / {{ readinessItems.length }}
              </NTag>
            </template>
            <div class="space-y-2">
              <button
                v-for="item in readinessItems"
                :key="item.id"
                class="w-full border border-border-light rounded-md bg-bg-page px-3 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary-soft/20"
                @click="router.push(item.route)"
              >
                <div class="flex items-start gap-3">
                  <CheckCircle2 v-if="item.ready" :size="16" class="mt-0.5 shrink-0 text-green-600" />
                  <AlertTriangle v-else :size="16" class="mt-0.5 shrink-0 text-yellow-500" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-3">
                      <span class="text-sm text-text-primary font-medium">{{ item.label }}</span>
                      <span class="shrink-0 text-xs text-primary">{{ item.actionLabel }} →</span>
                    </div>
                    <p class="mt-0.5 text-xs text-text-muted leading-relaxed">
                      {{ item.description }}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </NPanel>

          <!-- Story Bible Snippet -->
          <NPanel title="故事设定集预览" padding>
            <template #actions>
              <NButton variant="ghost" size="sm" @click="router.push(`/project/${projectId}/bible`)">
                前往配置 <ChevronRight :size="14" />
              </NButton>
            </template>
            <div class="space-y-4">
              <div v-if="projectStore.currentProject?.theme">
                <span class="text-xs text-text-muted font-bold tracking-wider uppercase">核心主题</span>
                <p class="mt-1 text-sm text-text-primary">
                  {{ projectStore.currentProject.theme }}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="border border-border-light rounded-lg bg-bg-page p-3">
                  <div class="text-lg text-text-primary font-bold">
                    {{ characterStore.characters.length }}
                  </div>
                  <div class="text-xs text-text-muted">
                    活跃角色
                  </div>
                </div>
                <div class="border border-border-light rounded-lg bg-bg-page p-3">
                  <div class="text-lg text-text-primary font-bold">
                    {{ volumeStore.volumes.length }}
                  </div>
                  <div class="text-xs text-text-muted">
                    分卷数
                  </div>
                </div>
              </div>
            </div>
          </NPanel>

          <!-- Recent Chapters -->
          <NPanel title="最近章节" padding>
            <template #actions>
              <NButton variant="ghost" size="sm" @click="router.push(`/project/${projectId}/outline`)">
                查看所有 <ChevronRight :size="14" />
              </NButton>
            </template>
            <div v-if="chapterStore.chapters.length === 0" class="py-8 text-center">
              <BookText class="mx-auto mb-2 text-text-muted" :size="32" opacity="0.3" />
              <p class="text-sm text-text-muted">
                暂无章节内容
              </p>
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="ch in [...chapterStore.chapters].sort((a, b) => b.chapterNumber - a.chapterNumber).slice(0, 3)"
                :key="ch.id"
                class="group flex cursor-pointer items-center justify-between border border-transparent rounded-lg p-3 transition-colors hover:border-border-light hover:bg-bg-page"
                @click="router.push(`/project/${projectId}/write?chapter=${ch.id}`)"
              >
                <div class="flex items-center gap-3">
                  <div class="h-8 w-8 flex items-center justify-center rounded bg-bg-subtle text-xs text-text-muted font-mono">
                    {{ ch.chapterNumber }}
                  </div>
                  <div>
                    <div class="text-sm text-text-primary font-medium group-hover:text-primary">
                      {{ ch.title }}
                    </div>
                    <div class="text-xs text-text-muted">
                      {{ ch.status }} · {{ ch.draft?.length || 0 }} 字
                    </div>
                  </div>
                </div>
                <ChevronRight :size="14" class="text-text-muted transition-colors group-hover:text-primary" />
              </div>
            </div>
          </NPanel>
        </div>

        <!-- AI Assistant Suggestion -->
        <div v-if="showAISuggestion" class="flex items-start gap-6 border border-ai/20 rounded-xl bg-ai-soft p-6">
          <div class="h-12 w-12 flex shrink-0 items-center justify-center border border-ai/10 rounded-lg bg-white shadow-sm">
            <Sparkles class="text-ai" :size="24" />
          </div>
          <div class="flex-1">
            <h3 class="mb-1 text-lg text-ai font-bold">
              AI 创作灵感
            </h3>
            <p class="mb-4 text-sm text-text-secondary leading-relaxed">
              根据你的故事设定集，我建议可以尝试三个新角色类型，以在你目前的设定中制造自然的剧情冲突。想要探索一下吗？
            </p>
            <div class="flex gap-2">
              <NButton variant="ai" size="sm" class="border-none bg-ai text-white" @click="handleExploreCharacters">
                探索角色
              </NButton>
              <NButton variant="ghost" size="sm" class="text-text-muted" @click="showAISuggestion = false">
                忽略
              </NButton>
            </div>
          </div>
        </div>
      </template>
    </div>
  </NAppLayout>
</template>
