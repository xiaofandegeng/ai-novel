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
  BookText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  Library,
  PenLine,
  Plus,
  Save,
  Sparkles,
  Users,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import {
  useChapterStore,
  useCharacterStore,
  useProjectStore,
  useVolumeStore,
} from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const characterStore = useCharacterStore()
const volumeStore = useVolumeStore()
const chapterStore = useChapterStore()
const getCharName = (id: string) => characterStore.characters.find((c: any) => c.id === id)?.name || ''

const loading = ref(true)
const saving = ref(false)
const selectedChapterId = ref<string | null>(null)
const expandedVolumes = ref<Record<string, boolean>>({})

// Form state for Outline
const outlineForm = ref({
  title: '',
  goals: '',
  conflicts: '',
  events: '',
  emotionalArc: '',
  foreshadowing: '',
  endingHook: '',
  status: 'planning' as any,
  characterIds: [] as string[],
})

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
      volumeStore.fetchVolumes(projectId),
      chapterStore.fetchChapters(projectId),
    ])

    // Expand all volumes by default
    volumeStore.volumes.forEach((v: any) => expandedVolumes.value[v.id] = true)

    if (chapterStore.chapters.length > 0) {
      selectChapter(chapterStore.chapters[0].id)
    }
  }
  catch {
    toast.add('Failed to load outline data', 'error')
  }
  finally {
    loading.value = false
  }
})

function selectChapter(id: string) {
  selectedChapterId.value = id
  const ch = chapterStore.chapters.find((c: any) => c.id === id)
  if (ch) {
    outlineForm.value = {
      title: ch.title,
      goals: ch.goals || '',
      conflicts: ch.conflicts || '',
      events: ch.events || '',
      emotionalArc: ch.emotionalArc || '',
      foreshadowing: ch.foreshadowing || '',
      endingHook: ch.endingHook || '',
      status: ch.status,
      characterIds: ch.characters ? JSON.parse(ch.characters) : [],
    }
  }
}

async function handleSave() {
  if (!selectedChapterId.value)
    return
  saving.value = true
  try {
    const data = {
      ...outlineForm.value,
      characters: JSON.stringify(outlineForm.value.characterIds),
    }
    await chapterStore.updateChapter(projectId, selectedChapterId.value, data)
    toast.add('Outline saved', 'success')
  }
  catch {
    toast.add('Failed to save', 'error')
  }
  finally {
    saving.value = false
  }
}

async function handleAddChapter(volumeId: string) {
  try {
    const lastChapter = chapterStore.chapters.filter((c: any) => c.volumeId === volumeId).sort((a: any, b: any) => b.chapterNumber - a.chapterNumber)[0]
    const nextNumber = lastChapter ? lastChapter.chapterNumber + 1 : 1

    const newCh = await chapterStore.createChapter(projectId, {
      title: `New Chapter ${nextNumber}`,
      volumeId,
      chapterNumber: nextNumber,
      status: 'planning',
    })
    toast.add('Chapter added', 'success')
    selectChapter(newCh.id)
  }
  catch {
    toast.add('Failed to add chapter', 'error')
  }
}

async function handleAddVolume() {
  try {
    const nextOrder = volumeStore.volumes.length + 1
    await volumeStore.createVolume(projectId, {
      title: `Volume ${nextOrder}`,
      orderIndex: nextOrder,
    })
    toast.add('Volume added', 'success')
  }
  catch {
    toast.add('Failed to add volume', 'error')
  }
}

function toggleVolume(id: string) {
  expandedVolumes.value[id] = !expandedVolumes.value[id]
}

const statusOptions = [
  { value: 'not_started', label: '未开始', variant: 'default' },
  { value: 'planning', label: '规划中', variant: 'info' },
  { value: 'writing', label: '写作中', variant: 'primary' },
  { value: 'completed', label: '已完成', variant: 'success' },
]

function toggleCharacter(charId: string) {
  const index = outlineForm.value.characterIds.indexOf(charId)
  if (index === -1) {
    outlineForm.value.characterIds.push(charId)
  }
  else {
    outlineForm.value.characterIds.splice(index, 1)
  }
}

const isBrainstorming = ref(false)
const aiSuggestion = ref<string | null>(null)

async function handleAIBrainstorm() {
  if (!selectedChapterId.value)
    return
  isBrainstorming.value = true
  aiSuggestion.value = '' // Clear and show area

  try {
    const context = `
      Project: ${projectStore.currentProject?.title}
      Theme: ${projectStore.currentProject?.theme}
      Current Chapter: ${outlineForm.value.title}
      Characters Involved: ${outlineForm.value.characterIds.map(id => getCharName(id)).join(', ')}
    `

    // We target the AI chat endpoint but with a specialized instruction
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        messages: [{
          role: 'user',
          content: `Based on the context, brainstorm a detailed outline for this chapter. 
           Please provide: 1. Core Conflict, 2. Three Key Events, 3. An Ending Hook. 
           Keep it concise and dramatic.`,
        }],
        context,
      }),
    })

    if (!response.body)
      throw new Error('AI response body is empty')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let result = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      result += decoder.decode(value)
    }

    // Set the result for user review in the sidebar
    aiSuggestion.value = result
  }
  catch {
    toast.add('AI Brainstorm failed', 'error')
    aiSuggestion.value = null
  }
  finally {
    isBrainstorming.value = false
  }
}

function applyAISuggestion() {
  if (!aiSuggestion.value)
    return
  outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + aiSuggestion.value
  aiSuggestion.value = null
  toast.add('Suggestion applied', 'success')
}

function discardAISuggestion() {
  aiSuggestion.value = null
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

    <template #topbar-right>
      <div v-if="selectedChapterId" class="flex gap-2">
        <NButton variant="ghost" size="sm" @click="router.push(`/project/${projectId}/write?chapter=${selectedChapterId}`)">
          <PenLine :size="16" class="mr-1.5" /> 开始写作
        </NButton>
        <NButton variant="primary" size="sm" :loading="saving" @click="handleSave">
          <Save :size="16" class="mr-1.5" /> 保存大纲
        </NButton>
      </div>
    </template>

    <div class="h-full flex overflow-hidden bg-bg-page">
      <!-- Left: Structure Tree -->
      <aside class="w-72 flex shrink-0 flex-col border-r border-border-light bg-bg-surface">
        <div class="flex items-center justify-between border-b border-border-light p-4">
          <h2 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
            <NButton variant="ghost" size="sm" class="h-8 w-8 p-0 -ml-2" @click="router.back()">
              <ChevronLeft :size="18" />
            </NButton>
            <Layers :size="16" /> 故事结构
          </h2>
          <NButton variant="ghost" size="sm" @click="handleAddVolume">
            <Plus :size="16" />
          </NButton>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div v-if="volumeStore.volumes.length === 0" class="py-8 text-center">
            <p class="mb-3 text-xs text-text-muted">
              尚未定义任何卷。
            </p>
            <NButton size="sm" @click="handleAddVolume">
              创建第 1 卷
            </NButton>
          </div>

          <div v-for="vol in volumeStore.volumes" :key="vol.id" class="space-y-1">
            <button
              class="group w-full flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-bg-subtle"
              @click="toggleVolume(vol.id)"
            >
              <component :is="expandedVolumes[vol.id] ? ChevronDown : ChevronRight" :size="14" class="text-text-muted" />
              <Library :size="16" class="text-text-secondary" />
              <span class="flex-1 truncate text-left text-sm text-text-primary font-bold">{{ vol.title }}</span>
              <Plus
                :size="14"
                class="text-text-muted opacity-0 transition-all hover:text-primary group-hover:opacity-100"
                @click.stop="handleAddChapter(vol.id)"
              />
            </button>

            <div v-if="expandedVolumes[vol.id]" class="pl-6 space-y-1">
              <button
                v-for="ch in chapterStore.chapters.filter((c: any) => c.volumeId === vol.id).sort((a: any, b: any) => a.chapterNumber - b.chapterNumber)"
                :key="ch.id"
                class="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-all"
                :class="selectedChapterId === ch.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-secondary hover:bg-bg-subtle'"
                @click="selectChapter(ch.id)"
              >
                <div class="h-5 w-5 flex shrink-0 items-center justify-center border border-current rounded-full text-[10px]">
                  {{ ch.chapterNumber }}
                </div>
                <span class="flex-1 truncate">{{ ch.title }}</span>
                <div v-if="ch.status === 'completed'" class="h-1.5 w-1.5 rounded-full bg-semantic-success" />
              </button>

              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted italic transition-colors hover:text-primary"
                @click="handleAddChapter(vol.id)"
              >
                <Plus :size="12" /> 添加章节...
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- Center: Outline Editor -->
      <main class="flex-1 overflow-y-auto bg-bg-page p-8 lg:p-12">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!selectedChapterId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
          <BookText :size="64" stroke-width="1" class="mb-4" />
          <p>选择一个章节以规划其大纲</p>
        </div>

        <div v-else class="mx-auto max-w-3xl space-y-12">
          <!-- Chapter Header -->
          <header class="space-y-6">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <input
                  v-model="outlineForm.title"
                  class="w-full border-none bg-transparent p-0 text-3xl text-text-primary font-bold focus:outline-none focus:ring-0"
                  placeholder="章节标题"
                >
              </div>
              <div class="flex items-center gap-4">
                <NButton variant="ai" size="sm" :loading="isBrainstorming" @click="handleAIBrainstorm">
                  <Sparkles :size="16" class="mr-1.5" /> AI 灵感风暴
                </NButton>
                <div class="h-6 w-px bg-border-light" />
                <div class="flex items-center gap-2">
                  <span class="mr-2 text-xs text-text-muted font-bold uppercase">Status</span>
                  <select
                    v-model="outlineForm.status"
                    class="border border-border-light rounded-md bg-bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </header>

          <!-- Characters Presence -->
          <section class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
                <Users :size="16" /> 登场角色
              </h3>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="char in characterStore.characters"
                :key="char.id"
                class="flex items-center gap-2 border rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                :class="outlineForm.characterIds.includes(char.id)
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-bg-surface text-text-muted border-border-light hover:border-text-muted'"
                @click="toggleCharacter(char.id)"
              >
                {{ char.name }}
                <Plus v-if="!outlineForm.characterIds.includes(char.id)" :size="10" />
              </button>
              <NButton v-if="characterStore.characters.length === 0" variant="ghost" size="sm" @click="router.push(`/project/${projectId}/characters`)">
                请先创建角色
              </NButton>
            </div>
          </section>

          <!-- Detailed Outline Fields -->
          <div class="space-y-8">
            <div class="grid gap-8">
              <NTextArea
                v-model="outlineForm.goals"
                label="本章创作目标"
                placeholder="本章必须发生什么？需要揭露哪些信息？"
                :rows="3"
              />

              <div class="grid gap-8 md:grid-cols-2">
                <NTextArea
                  v-model="outlineForm.conflicts"
                  label="核心冲突"
                  placeholder="外部干扰或内心博弈..."
                  :rows="4"
                />
                <NTextArea
                  v-model="outlineForm.emotionalArc"
                  label="情感基调"
                  placeholder="读者应该感受到什么？情绪如何转变？"
                  :rows="4"
                />
              </div>

              <NTextArea
                v-model="outlineForm.events"
                label="关键事件（剧情拆解）"
                placeholder="1. 主角到达...&#10;2. 冲突爆发...&#10;3. 发现关键线索..."
                :rows="8"
              />

              <div class="grid gap-8 md:grid-cols-2">
                <NTextArea
                  v-model="outlineForm.foreshadowing"
                  label="伏笔与铺垫"
                  placeholder="为后续情节埋下的细节..."
                  :rows="4"
                />
                <NTextArea
                  v-model="outlineForm.endingHook"
                  label="结尾悬念 (Hook)"
                  placeholder="引向下一章的悬念或转折点..."
                  :rows="4"
                />
              </div>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="flex items-center justify-between border-t border-border-light pt-8">
            <p class="flex items-center gap-2 text-xs text-text-muted italic">
              <Info :size="14" /> AI 在生成初稿时将参考这些细节作为叙事蓝图。
            </p>
            <NButton variant="primary" :loading="saving" @click="handleSave">
              更新大纲设定
            </NButton>
          </div>
        </div>
      </main>

      <!-- Right: AI Aide -->
      <aside class="hidden w-80 shrink-0 flex-col border-l border-border-light bg-bg-surface xl:flex">
        <div class="border-b border-border-light bg-bg-page/50 p-4">
          <h2 class="flex items-center gap-2 text-sm text-ai font-bold tracking-wider uppercase">
            <NButton variant="ghost" size="sm" class="h-8 w-8 p-0 -ml-2" @click="router.back()">
              <ChevronLeft :size="18" />
            </NButton>
            <Sparkles :size="16" /> 大纲助手
          </h2>
        </div>
        <div class="overflow-y-auto p-6 space-y-6">
          <div v-if="aiSuggestion !== null || isBrainstorming" class="animate-in fade-in slide-in-from-right-4 border border-ai/10 rounded-xl bg-ai-soft p-4">
            <div class="mb-2 flex items-center justify-between">
              <p class="flex items-center gap-2 text-sm text-text-primary font-bold">
                <Sparkles :size="14" class="text-ai" /> AI 建议方案
              </p>
              <NButton v-if="aiSuggestion" variant="ghost" size="sm" @click="discardAISuggestion">
                放弃
              </NButton>
            </div>
            <div v-if="isBrainstorming && !aiSuggestion" class="py-4 space-y-2">
              <div class="h-2 w-3/4 animate-pulse rounded-full bg-ai/20" />
              <div class="h-2 w-1/2 animate-pulse rounded-full bg-ai/20" />
            </div>
            <div v-else class="mb-4 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs text-text-secondary leading-relaxed italic">
              {{ aiSuggestion }}
            </div>
            <NButton
              v-if="aiSuggestion"
              variant="ai"
              size="sm"
              class="w-full border-none bg-ai text-white shadow-ai/20 shadow-sm"
              @click="applyAISuggestion"
            >
              应用到大纲
            </NButton>
          </div>

          <div v-else class="group border border-border-light rounded-xl bg-bg-surface p-4 transition-colors hover:border-ai/30">
            <p class="mb-1 text-sm text-text-primary font-medium">
              生成章节计划
            </p>
            <p class="mb-4 text-xs text-text-secondary leading-relaxed">
              我将根据您的故事设定集，构思本章的关键事件与悬念。
            </p>
            <NButton variant="ghost" size="sm" class="w-full group-hover:bg-ai/5 group-hover:text-ai" @click="handleAIBrainstorm">
              建议方案
            </NButton>
          </div>

          <div class="space-y-4">
            <h3 class="text-xs text-text-muted font-bold tracking-wider uppercase">
              相关背景设定
            </h3>
            <div class="border border-border-light rounded-lg bg-bg-subtle p-3">
              <div class="mb-1 text-[10px] text-text-muted font-bold">
                世界观 / 主题
              </div>
              <p class="line-clamp-4 text-xs text-text-primary">
                {{ projectStore.currentProject?.theme || '尚未定义主题。' }}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </NAppLayout>
</template>
