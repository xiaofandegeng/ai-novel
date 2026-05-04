<script setup lang="ts">
import type { ChapterStatus, CreateChapterElementInput } from '@ai-novel/shared'
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
  X,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { generateAIStream, readChatStream } from '@/api/ai'
import AppSidebar from '../components/AppSidebar.vue'
import ChapterTitleField from '../features/outline/components/ChapterTitleField.vue'
import {
  useChapterElementStore,
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
const chapterElementStore = useChapterElementStore()

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
  status: 'planning' as ChapterStatus,
  characterIds: [] as string[],
})

// Chapter element drafts
const chapterElementDrafts = ref<CreateChapterElementInput[]>([])

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
      volumeStore.fetchVolumes(projectId),
      chapterStore.fetchChapters(projectId),
    ])

    // Expand all volumes by default
    volumeStore.volumes.forEach(v => expandedVolumes.value[v.id] = true)

    if (chapterStore.chapters.length > 0) {
      selectChapter(chapterStore.chapters[0].id)
    }
  }
  catch {
    toast.add('大纲数据加载失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function selectChapter(id: string) {
  selectedChapterId.value = id
  const ch = chapterStore.chapters.find(c => c.id === id)
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
  try {
    await chapterElementStore.fetchElements(projectId, id)
    chapterElementDrafts.value = chapterElementStore.elements.map(e => ({
      elementType: e.elementType,
      elementId: e.elementId || undefined,
      elementName: e.elementName,
      relationType: e.relationType,
      importance: e.importance,
      appearanceOrder: e.appearanceOrder || undefined,
      notes: e.notes || undefined,
    }))
  }
  catch {
    chapterElementDrafts.value = []
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
    await chapterElementStore.replaceElements(projectId, selectedChapterId.value, {
      elements: chapterElementDrafts.value,
    })
    toast.add('大纲已保存', 'success')
  }
  catch {
    toast.add('大纲保存失败', 'error')
  }
  finally {
    saving.value = false
  }
}

async function handleAddChapter(volumeId: string) {
  try {
    const lastChapter = chapterStore.chapters.filter(c => c.volumeId === volumeId).sort((a, b) => b.chapterNumber - a.chapterNumber)[0]
    const nextNumber = lastChapter ? lastChapter.chapterNumber + 1 : 1

    const newCh = await chapterStore.createChapter(projectId, {
      title: `第 ${nextNumber} 章`,
      volumeId,
      chapterNumber: nextNumber,
      status: 'planning',
    })
    toast.add('章节已添加', 'success')
    selectChapter(newCh.id)
  }
  catch {
    toast.add('章节添加失败', 'error')
  }
}

async function handleAddVolume() {
  try {
    const nextOrder = volumeStore.volumes.length + 1
    await volumeStore.createVolume(projectId, {
      title: `第 ${nextOrder} 卷`,
      orderIndex: nextOrder,
    })
    toast.add('分卷已添加', 'success')
  }
  catch {
    toast.add('分卷添加失败', 'error')
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

// --- Chapter element helpers ---
const newEventName = ref('')

function addCharacterElement(charId: string) {
  const char = characterStore.characters.find(c => c.id === charId)
  if (!char)
    return
  const exists = chapterElementDrafts.value.some(
    e => e.elementType === 'character' && e.elementId === charId,
  )
  if (exists)
    return
  chapterElementDrafts.value.push({
    elementType: 'character',
    elementId: char.id,
    elementName: char.name,
    relationType: 'appears',
    importance: 'major',
  })
}

function removeElement(index: number) {
  chapterElementDrafts.value.splice(index, 1)
}

function addEventElement() {
  const name = newEventName.value.trim()
  if (!name)
    return
  chapterElementDrafts.value.push({
    elementType: 'event',
    elementName: name,
    relationType: 'occurs',
    importance: 'major',
  })
  newEventName.value = ''
}

const isBrainstorming = ref(false)
const aiSuggestion = ref<string | null>(null)
const outlineAlternatives = ref<string[]>([])

async function handleAIBrainstorm() {
  if (!selectedChapterId.value)
    return
  isBrainstorming.value = true
  aiSuggestion.value = ''

  try {
    const response = await generateAIStream({
      projectId,
      scene: 'outline',
      chapterId: selectedChapterId.value,
      userInstruction: `Based on the context, brainstorm a detailed outline for this chapter.
         Please provide: 1. Core Conflict, 2. Three Key Events, 3. An Ending Hook.
         Keep it concise and dramatic.`,
    })

    await readChatStream(response, (text) => {
      aiSuggestion.value = text
    })
  }
  catch (error: any) {
    toast.add(error.message || 'AI 灵感风暴失败', 'error')
    aiSuggestion.value = null
  }
  finally {
    isBrainstorming.value = false
  }
}

function confirmOutlineAIResult(action: 'insert' | 'replace' | 'backup' | 'discard') {
  if (!aiSuggestion.value)
    return

  if (action === 'insert') {
    outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + aiSuggestion.value
    toast.add('AI 建议已插入关键事件', 'success')
  }
  else if (action === 'replace') {
    outlineForm.value.events = aiSuggestion.value
    toast.add('AI 建议已替换关键事件', 'success')
  }
  else if (action === 'backup') {
    outlineAlternatives.value.unshift(aiSuggestion.value)
    toast.add('AI 建议已保存为备选', 'success')
  }
  else {
    toast.add('AI 建议已丢弃', 'info')
  }

  aiSuggestion.value = null
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '加载中...'" :project-id="projectId">
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
          {{ projectStore.currentProject?.title || '加载中...' }}
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
                v-for="ch in chapterStore.chapters.filter((c) => c.volumeId === vol.id).sort((a, b) => a.chapterNumber - b.chapterNumber)"
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
                <ChapterTitleField v-model="outlineForm.title" />
              </div>
              <div class="flex items-center gap-4">
                <NButton variant="ai" size="sm" :loading="isBrainstorming" @click="handleAIBrainstorm">
                  <Sparkles :size="16" class="mr-1.5" /> AI 灵感风暴
                </NButton>
                <div class="h-6 w-px bg-border-light" />
                <div class="flex items-center gap-2">
                  <span class="mr-2 text-xs text-text-muted font-bold">状态</span>
                  <select
                    v-model="outlineForm.status"
                    aria-label="章节状态"
                    class="border border-border-light rounded-md bg-bg-surface px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus:ring-1 focus-visible:ring-primary/20 focus:ring-primary"
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

          <!-- Chapter Structured Elements -->
          <section class="space-y-4">
            <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
              <Layers :size="16" /> 本章结构化元素
            </h3>

            <!-- Must-appear characters -->
            <div>
              <label class="mb-2 block text-xs text-text-muted font-semibold">必须出场人物</label>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="(el, idx) in chapterElementDrafts.filter(e => e.elementType === 'character')"
                  :key="idx"
                  class="flex items-center gap-1 border border-primary/30 rounded-full bg-primary-soft px-3 py-1 text-xs text-primary"
                >
                  {{ el.elementName }}
                  <button class="text-primary/60 hover:text-primary" @click="removeElement(chapterElementDrafts.indexOf(el))">
                    <X :size="12" />
                  </button>
                </span>
                <button
                  v-for="char in characterStore.characters.filter(c => !chapterElementDrafts.some(e => e.elementType === 'character' && e.elementId === c.id))"
                  :key="char.id"
                  class="flex items-center gap-1 border border-border-light rounded-full bg-bg-surface px-3 py-1 text-xs text-text-muted transition-colors hover:border-primary hover:text-primary"
                  @click="addCharacterElement(char.id)"
                >
                  <Plus :size="10" /> {{ char.name }}
                </button>
              </div>
            </div>

            <!-- Key events -->
            <div>
              <label class="mb-2 block text-xs text-text-muted font-semibold">关键事件</label>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="(el, idx) in chapterElementDrafts.filter(e => e.elementType === 'event')"
                  :key="idx"
                  class="flex items-center gap-1 border border-ai/30 rounded-full bg-ai-soft px-3 py-1 text-xs text-ai"
                >
                  {{ el.elementName }}
                  <button class="text-ai/60 hover:text-ai" @click="removeElement(chapterElementDrafts.indexOf(el))">
                    <X :size="12" />
                  </button>
                </span>
              </div>
              <div class="mt-2 flex gap-2">
                <input
                  v-model="newEventName"
                  class="flex-1 border border-border-light rounded-md bg-bg-surface px-3 py-1.5 text-xs"
                  placeholder="输入关键事件名称"
                  @keydown.enter="addEventElement"
                >
                <NButton size="sm" variant="ghost" :disabled="!newEventName.trim()" @click="addEventElement">
                  <Plus :size="14" class="mr-1" /> 添加事件
                </NButton>
              </div>
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
            </div>
            <div v-if="isBrainstorming && !aiSuggestion" class="py-4 space-y-2">
              <div class="h-2 w-3/4 animate-pulse rounded-full bg-ai/20" />
              <div class="h-2 w-1/2 animate-pulse rounded-full bg-ai/20" />
            </div>
            <div v-else class="mb-4 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs text-text-secondary leading-relaxed italic">
              {{ aiSuggestion }}
            </div>
            <div v-if="aiSuggestion" class="grid grid-cols-2 gap-2">
              <NButton size="sm" variant="ai" @click="confirmOutlineAIResult('insert')">
                插入
              </NButton>
              <NButton size="sm" variant="ghost" @click="confirmOutlineAIResult('replace')">
                替换
              </NButton>
              <NButton size="sm" variant="ghost" @click="confirmOutlineAIResult('backup')">
                存为备选
              </NButton>
              <NButton size="sm" variant="ghost" @click="confirmOutlineAIResult('discard')">
                丢弃
              </NButton>
            </div>
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
