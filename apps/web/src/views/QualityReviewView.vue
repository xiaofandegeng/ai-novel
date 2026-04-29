<script setup lang="ts">
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

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const chapterStore = useChapterStore()

const loading = ref(true)
const selectedChapterId = ref('')

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      chapterStore.fetchChapters(projectId),
    ])
    selectedChapterId.value = chapterStore.chapters[0]?.id || ''
  }
  catch {
    toast.add('Failed to load quality workspace', 'error')
  }
  finally {
    loading.value = false
  }
})

const selectedChapter = computed(() =>
  chapterStore.chapters.find(ch => ch.id === selectedChapterId.value),
)

const wordCount = computed(() => selectedChapter.value?.draft?.length || 0)
const hasEnoughText = computed(() => wordCount.value >= 500)

const qualityDimensions = computed(() => [
  {
    label: '节奏密度',
    score: hasEnoughText.value ? 76 : 0,
    description: '场景推进、信息释放与段落呼吸感。',
    icon: Gauge,
  },
  {
    label: '冲突强度',
    score: hasEnoughText.value ? 68 : 0,
    description: '人物目标、阻力与场景张力是否清晰。',
    icon: Target,
  },
  {
    label: '逻辑连续性',
    score: hasEnoughText.value ? 82 : 0,
    description: '事件因果、设定约束和前后文一致性。',
    icon: CheckCircle2,
  },
  {
    label: '人物一致性',
    score: hasEnoughText.value ? 73 : 0,
    description: '行为、语言和动机是否贴合人物档案。',
    icon: BookOpen,
  },
])

const overallScore = computed(() => {
  if (!hasEnoughText.value)
    return 0
  const total = qualityDimensions.value.reduce((sum, item) => sum + item.score, 0)
  return Math.round(total / qualityDimensions.value.length)
})
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || 'Loading...'">
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-3">
        <NTag variant="warning" size="sm">
          待接入 AI 评估 API
        </NTag>
        <NButton variant="primary" size="sm" :disabled="!hasEnoughText">
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
            <h1 class="text-3xl text-text-primary font-bold">
              质量评估工作台
            </h1>
            <p class="mt-2 max-w-2xl text-sm text-text-secondary leading-relaxed">
              当前页面先统一质量评估的信息架构和视觉入口，后续接入 AI 后会生成可保存的章节与全书评估报告。
            </p>
          </div>

          <div class="border border-border-light rounded-lg bg-bg-surface p-4 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              当前综合评分
            </div>
            <div class="mt-1 flex items-end gap-2">
              <span class="text-4xl text-text-primary font-bold">{{ overallScore }}</span>
              <span class="pb-1 text-sm text-text-muted">/ 100</span>
            </div>
          </div>
        </header>

        <div class="grid gap-6 lg:grid-cols-[320px_1fr]">
          <NPanel title="章节选择" description="选择需要评估的正文样本" padding>
            <div v-if="chapterStore.chapters.length === 0" class="py-10 text-center text-sm text-text-muted">
              暂无章节。请先在大纲中创建章节。
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
                      {{ chapter.draft?.length || 0 }} 字 · {{ chapter.status }}
                    </div>
                  </div>
                  <ChevronRight :size="15" />
                </div>
              </button>
            </div>
          </NPanel>

          <div class="space-y-6">
            <NPanel title="评估维度" :description="selectedChapter ? selectedChapter.title : '未选择章节'" padding>
              <div v-if="!hasEnoughText" class="mb-5 flex items-start gap-3 border border-semantic-warning/20 rounded-lg bg-semantic-warning/10 p-4">
                <AlertTriangle :size="18" class="mt-0.5 text-semantic-warning" />
                <div>
                  <div class="text-sm text-text-primary font-semibold">
                    正文样本偏短
                  </div>
                  <p class="mt-1 text-sm text-text-secondary">
                    建议章节正文超过 500 字后再生成正式质量报告，避免 AI 给出过度泛化的建议。
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
            </NPanel>

            <NPanel title="待生成的编辑建议" description="AI 接入后，建议只进入确认区，不直接改写正文" padding>
              <div class="grid gap-3 md:grid-cols-3">
                <div class="border border-border-light rounded-lg bg-bg-surface p-4">
                  <div class="text-sm text-text-primary font-semibold">
                    问题清单
                  </div>
                  <p class="mt-2 text-xs text-text-secondary leading-relaxed">
                    标记节奏拖沓、冲突缺位、设定矛盾等具体段落。
                  </p>
                </div>
                <div class="border border-border-light rounded-lg bg-bg-surface p-4">
                  <div class="text-sm text-text-primary font-semibold">
                    修订建议
                  </div>
                  <p class="mt-2 text-xs text-text-secondary leading-relaxed">
                    给出可执行改法，但必须由作者确认后应用。
                  </p>
                </div>
                <div class="border border-border-light rounded-lg bg-bg-surface p-4">
                  <div class="text-sm text-text-primary font-semibold">
                    历史报告
                  </div>
                  <p class="mt-2 text-xs text-text-secondary leading-relaxed">
                    保存每次评估结果，便于比较修订前后的质量变化。
                  </p>
                </div>
              </div>
            </NPanel>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
