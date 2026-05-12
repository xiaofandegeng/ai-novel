<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NTextArea,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  Globe,
  Info,
  Layout,
  Save,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAIStream } from '@/composables/useAIStream'
import AppSidebar from '../components/AppSidebar.vue'
import { useProjectStore, useStoryBibleStore } from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()

const loading = ref(true)
const saving = ref(false)
const activeSection = ref('worldview')

const sections = [
  { id: 'worldview', label: '世界观', icon: Globe, field: 'worldview', placeholder: '描述魔法系统、地理环境、社会结构等...' },
  { id: 'conflict', label: '核心矛盾', icon: Zap, field: 'mainConflict', placeholder: '故事的驱动力是什么？冲突的各方分别想要什么？' },
  { id: 'theme', label: '核心主题', icon: Info, field: 'theme', placeholder: '救赎、牺牲、技术 vs 自然...' },
  { id: 'rules', label: '铁律与禁忌', icon: ShieldAlert, field: 'rules', placeholder: '这个世界中有哪些不可动摇的基本法则？' },
  { id: 'timeline', label: '大事年表', icon: Calendar, field: 'timeline', placeholder: '导致故事当前状态的关键历史事件...' },
]

const form = ref({
  worldview: '',
  mainConflict: '',
  theme: '',
  rules: '',
  timeline: '',
})

// --- AI Section ---
const { isStreaming: isBrainstorming, stream: streamAI } = useAIStream()

interface ProcessedStoryBibleSuggestion {
  raw: string
  cleaned: string
  removedNotes: string[]
}

const aiSuggestion = ref<ProcessedStoryBibleSuggestion | null>(null)
const aiError = ref('')

function buildStoryBiblePrompt(prompt: string, sectionLabel: string) {
  return [
    prompt,
    '',
    `请只输出可直接写入【${sectionLabel}】设定栏的内容。`,
    '要求：',
    '1. 不要输出 Markdown 加粗、分割线、代码块或标题装饰。',
    '2. 不要向作者提问，不要写“作者决策点”“请告知倾向”等对话式内容。',
    '3. 如果有待决策内容，请直接整理成“待定：...”设定草案。',
    '4. 内容要保持设定口吻，便于作者确认后追加或替换到设定集中。',
  ].join('\n')
}

function normalizeStoryBibleSuggestion(raw: string): ProcessedStoryBibleSuggestion {
  const removedNotes: string[] = []
  const cleanedLines: string[] = []
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .split('\n')

  let inDecisionBlock = false

  for (const sourceLine of lines) {
    const trimmed = sourceLine.trim()

    if (!trimmed) {
      if (cleanedLines.length > 0 && cleanedLines.at(-1) !== '')
        cleanedLines.push('')
      continue
    }

    const line = trimmed
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/^\s*\*\s+/, '- ')
      .trim()

    if (/^-{3,}$/.test(line))
      continue

    const isDecisionHeading = /^(?:作者决策点|决策点|需要作者确认|下一步确认|请你选择|请告知)/.test(line)
    const isAssistantMeta = /请告知|告诉我你的倾向|我将据此|下一阶段|进入下一阶段|如果你愿意|我可以继续|是否需要|你倾向于/.test(line)

    if (isDecisionHeading) {
      inDecisionBlock = true
      removedNotes.push(line)
      continue
    }

    if (inDecisionBlock) {
      removedNotes.push(line)
      continue
    }

    if (/^(?:好的|当然|以下是|下面是|我建议|建议如下|分析如下)[：:,，]?/.test(line))
      continue

    if (isAssistantMeta) {
      removedNotes.push(line)
      continue
    }

    cleanedLines.push(line)
  }

  const cleaned = cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    raw,
    cleaned,
    removedNotes,
  }
}

async function handleAIBrainstorm(customPrompt?: string) {
  const section = sections.find(s => s.id === activeSection.value)
  const prompt = customPrompt || `基于当前项目主题"${projectStore.currentProject?.theme || '未定义'}"，为作品的"${section?.label}"部分提供一些深入的构思建议。`

  aiSuggestion.value = null
  aiError.value = ''

  try {
    const raw = await streamAI({
      projectId,
      scene: 'story_bible',
      userInstruction: buildStoryBiblePrompt(prompt, section?.label || '故事设定'),
    })
    const processed = normalizeStoryBibleSuggestion(raw)
    aiSuggestion.value = processed

    if (!processed.cleaned)
      aiError.value = 'AI 返回内容没有可直接写入设定的部分，请调整提示后重试。'
  }
  catch (error: any) {
    aiError.value = error.message || 'AI 辅助构思失败'
    toast.add(aiError.value, 'error')
  }
}

function handleApplyAI(action: 'append' | 'replace') {
  const suggestion = aiSuggestion.value?.cleaned.trim()
  if (!suggestion)
    return

  const section = sections.find(s => s.id === activeSection.value)
  if (!section)
    return

  const field = section.field as keyof typeof form.value
  if (action === 'append') {
    form.value[field] = (form.value[field] ? `${form.value[field]}\n\n` : '') + suggestion
  }
  else {
    form.value[field] = suggestion
  }

  aiSuggestion.value = null
  aiError.value = ''
  toast.add('已应用 AI 建议', 'success')
}

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      storyBibleStore.fetchStoryBible(projectId),
    ])

    if (storyBibleStore.storyBible) {
      const b = storyBibleStore.storyBible
      form.value = {
        worldview: b.worldview || '',
        mainConflict: b.mainConflict || '',
        theme: b.theme || '',
        rules: b.rules || '',
        timeline: b.timeline || '',
      }
    }
  }
  catch {
    toast.add('加载故事设定集失败，请稍后重试', 'error')
  }
  finally {
    loading.value = false
  }
})

async function handleSave() {
  saving.value = true
  try {
    if (storyBibleStore.storyBible) {
      await storyBibleStore.updateStoryBible(projectId, form.value)
    }
    else {
      await storyBibleStore.createStoryBible(projectId, form.value)
    }
    toast.add('故事设定集已保存', 'success')
  }
  catch {
    toast.add('保存失败，请稍后重试', 'error')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '加载中…'" :project-id="projectId">
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
          {{ projectStore.currentProject?.title || '加载中…' }}
        </router-link>
      </div>
    </template>
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <NButton
        variant="primary"
        size="sm"
        :loading="saving"
        @click="handleSave"
      >
        <Save :size="16" class="mr-1.5" /> 保存设定集
      </NButton>
    </template>

    <div class="h-full flex flex-col overflow-hidden bg-bg-page md:flex-row">
      <!-- Left: Sections Navigation -->
      <aside class="w-full shrink-0 overflow-y-auto border-r border-border-light bg-bg-surface md:w-64">
        <div class="border-b border-border-light p-4">
          <h2 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
            <NButton variant="ghost" size="sm" class="h-8 w-8 p-0 -ml-2" @click="router.back()">
              <ChevronLeft :size="18" />
            </NButton>
            <Layout :size="16" /> 设定板块
          </h2>
        </div>
        <nav class="p-2 space-y-1">
          <button
            v-for="section in sections"
            :key="section.id"
            class="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors"
            :class="activeSection === section.id
              ? 'bg-primary/10 text-primary'
              : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'"
            @click="activeSection = section.id"
          >
            <component :is="section.icon" :size="18" :class="activeSection === section.id ? 'text-primary' : 'text-text-muted'" />
            {{ section.label }}
          </button>
        </nav>
      </aside>

      <!-- Center: Editor Area -->
      <main class="flex-1 overflow-y-auto p-8 lg:p-12">
        <div class="mx-auto max-w-3xl space-y-8">
          <NLoadingState v-if="loading" />
          <template v-else>
            <div v-for="section in sections" :key="section.id">
              <Transition
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="opacity-0 translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
              >
                <div v-show="activeSection === section.id" class="space-y-6">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="mt-1 text-sm text-text-muted">
                        供 AI 创作时遵循的基础逻辑与规则。
                      </p>
                    </div>
                    <NButton variant="ai" size="sm" :loading="isBrainstorming" @click="handleAIBrainstorm()">
                      <Sparkles :size="14" class="mr-1.5" /> AI 辅助构思
                    </NButton>
                  </div>

                  <div v-if="isBrainstorming || aiSuggestion !== null || aiError" class="animate-in fade-in slide-in-from-top-2 border border-ai/20 rounded-lg bg-ai-soft/50 p-4 shadow-sm space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Sparkles :size="18" class="text-ai" />
                        <h3 class="text-sm text-ai font-bold uppercase">
                          AI 建议确认区
                        </h3>
                      </div>
                      <NButton variant="ghost" size="sm" @click="aiSuggestion = null; aiError = ''">
                        放弃
                      </NButton>
                    </div>
                    <div v-if="isBrainstorming && !aiSuggestion" class="flex items-center gap-2 py-4 text-sm text-text-muted">
                      <NLoadingState size="sm" /> 正在思考并构思建议...
                    </div>
                    <div v-else-if="aiError" class="border-error/20 bg-error/5 text-error border rounded-md p-3 text-sm font-medium">
                      {{ aiError }}
                    </div>
                    <template v-else-if="aiSuggestion">
                      <div class="border border-ai/10 rounded-md bg-white p-3">
                        <p class="mb-2 text-xs text-ai font-semibold">
                          已整理为可写入设定
                        </p>
                        <div class="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                          {{ aiSuggestion.cleaned || '暂无可写入内容' }}
                        </div>
                      </div>
                      <div v-if="aiSuggestion.removedNotes.length > 0" class="border border-border-light rounded-md bg-bg-subtle p-3">
                        <p class="mb-2 text-xs text-text-muted font-semibold">
                          已移出的问题与对话式内容
                        </p>
                        <ul class="max-h-28 list-disc overflow-y-auto pl-4 text-xs text-text-muted leading-relaxed space-y-1">
                          <li v-for="(note, index) in aiSuggestion.removedNotes" :key="`${index}-${note}`">
                            {{ note }}
                          </li>
                        </ul>
                      </div>
                    </template>
                    <div v-if="aiSuggestion?.cleaned" class="flex gap-2">
                      <NButton size="sm" variant="ai" @click="handleApplyAI('append')">
                        在末尾追加
                      </NButton>
                      <NButton size="sm" variant="ghost" @click="handleApplyAI('replace')">
                        全部替换
                      </NButton>
                    </div>
                    <NButton v-if="aiError" size="sm" variant="ghost" class="w-full text-xs" @click="handleAIBrainstorm()">
                      重试
                    </NButton>
                  </div>

                  <NTextArea
                    v-model="form[section.field as keyof typeof form]"
                    :label="section.label"
                    :placeholder="section.placeholder"
                    :rows="15"
                    class="bg-bg-surface text-lg leading-relaxed font-writing"
                  />

                  <div class="flex items-center justify-between pt-4">
                    <p class="text-xs text-text-muted">
                      <Info :size="12" class="mr-1 inline" /> 这些设定将在生成内容时自动作为 AI 的上下文参考。
                    </p>
                    <NButton variant="primary" :loading="saving" @click="handleSave">
                      保存本节设定
                    </NButton>
                  </div>
                </div>
              </Transition>
            </div>
          </template>
        </div>
      </main>

      <!-- Right: AI Assistant Panel -->
      <aside class="hidden w-80 shrink-0 flex-col overflow-hidden border-l border-border-light bg-bg-surface xl:flex">
        <div class="flex items-center justify-between border-b border-border-light bg-bg-page/50 p-4">
          <h2 class="flex items-center gap-2 text-sm text-ai font-bold tracking-wider uppercase">
            <Sparkles :size="16" /> AI 设定助手
          </h2>
        </div>
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <div class="border border-ai/10 rounded-lg bg-ai-soft p-4">
            <p class="mb-3 text-sm text-text-primary leading-relaxed">
              我可以帮你扩充世界观细节，或者检查规则中是否存在逻辑矛盾。
            </p>
            <div class="space-y-2">
              <button
                class="w-full border border-ai/20 rounded bg-white p-2 text-left text-xs text-ai transition-colors hover:bg-ai hover:text-white disabled:opacity-50"
                :disabled="isBrainstorming"
                @click="handleAIBrainstorm('请为当前的世界观设定建议 3 条具体且有趣的规则。')"
              >
                建议 3 条世界观规则
              </button>
              <button
                class="w-full border border-ai/20 rounded bg-white p-2 text-left text-xs text-ai transition-colors hover:bg-ai hover:text-white disabled:opacity-50"
                :disabled="isBrainstorming"
                @click="handleAIBrainstorm('分析当前世界观设定，识别可能存在的逻辑冲突或矛盾，并给出改进建议。')"
              >
                识别世界观冲突
              </button>
            </div>
          </div>

          <div>
            <h3 class="mb-3 text-xs text-text-muted font-bold tracking-wider uppercase">
              参考文档
            </h3>
            <div class="border-2 border-border-light rounded-xl border-dashed py-8 text-center">
              <p class="px-4 text-xs text-text-muted">
                尚未上传任何参考素材。
              </p>
              <NButton variant="ghost" size="sm" class="mt-2 text-xs" @click="$router.push(`/project/${projectId}/knowledge`)">
                上传素材
              </NButton>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </NAppLayout>
</template>

<style scoped>
.font-writing {
  font-family: serif;
}
</style>
