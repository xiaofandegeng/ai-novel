<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Maximize2,
  Minimize2,
  ScrollText,
  Sparkles,
  Users,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AIAssistantSidebar from '../components/AIAssistantSidebar.vue'
import {
  useChapterStore,
  useCharacterStore,
  useProjectStore,
  useStoryBibleStore,
  useVersionStore,
} from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const characterStore = useCharacterStore()
const chapterStore = useChapterStore()
const bibleStore = useStoryBibleStore()
const versionStore = useVersionStore()

const loading = ref(true)
const saving = ref(false)
const fullScreen = ref(false)
const activeContextTab = ref('outline') // outline, characters, bible
const draft = ref('')
const lastSavedDraft = ref('')

const currentChapterId = computed(() => route.query.chapter as string)
const currentChapter = computed(() => chapterStore.chapters.find(c => c.id === currentChapterId.value))

const wordCount = computed(() => draft.value.length)

interface PendingAIResult {
  content: string
  source: 'continue' | 'polish' | 'expand' | 'shorten' | 'chat'
  selectionStart: number
  selectionEnd: number
  originalText: string
}

const pendingAIResult = ref<PendingAIResult | null>(null)

// Auto-save logic
let saveTimer: any = null
function debouncedSave() {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(handleSave, 3000)
}

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      chapterStore.fetchChapters(projectId),
      characterStore.fetchCharacters(projectId),
      bibleStore.fetchStoryBible(projectId),
    ])

    // If no chapter in query, pick first or first incomplete
    if (!currentChapterId.value && chapterStore.chapters.length > 0) {
      const target = chapterStore.chapters.find(c => c.status !== 'completed') || chapterStore.chapters[0]
      router.replace({ query: { ...route.query, chapter: target.id } })
    }
    else if (currentChapter.value) {
      loadChapter(currentChapter.value)
    }
  }
  catch {
    toast.add('Failed to load writing workspace', 'error')
  }
  finally {
    loading.value = false
  }
})

function loadChapter(ch: any) {
  draft.value = ch.draft || ''
  lastSavedDraft.value = ch.draft || ''
}

watch(currentChapter, (newCh) => {
  if (newCh)
    loadChapter(newCh)
}, { immediate: true })

watch(draft, (newVal) => {
  if (newVal !== lastSavedDraft.value) {
    debouncedSave()
  }
})

async function handleSave() {
  if (!currentChapterId.value || draft.value === lastSavedDraft.value)
    return

  saving.value = true
  try {
    await chapterStore.updateChapter(projectId, currentChapterId.value, {
      draft: draft.value,
      status: 'writing',
    })
    lastSavedDraft.value = draft.value
  }
  catch (e) {
    console.error('Auto-save failed', e)
  }
  finally {
    saving.value = false
  }
}

async function handleSnapshot() {
  if (!currentChapterId.value || !draft.value)
    return
  try {
    await versionStore.createSnapshot(projectId, currentChapterId.value, draft.value, `Snapshot at ${new Date().toLocaleTimeString()}`)
    toast.add('Snapshot saved to history', 'success')
  }
  catch {
    toast.add('Failed to save snapshot', 'error')
  }
}

function switchChapter(id: string) {
  handleSave() // Save current before switching
  router.push({ query: { ...route.query, chapter: id } })
}

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    handleSave()
  }
})

// Context helpers
const presentCharacters = computed(() => {
  if (!currentChapter.value?.characters)
    return []
  try {
    const ids = JSON.parse(currentChapter.value.characters)
    return characterStore.characters.filter(c => ids.includes(c.id))
  }
  catch { return [] }
})

// Phase 8: Floating Toolbar & AI Actions
const editorRef = ref<HTMLTextAreaElement | null>(null)
const aiSidebarRef = ref<any>(null)
const showFloatingBar = ref(false)
const floatingPos = ref({ top: 0, left: 0 })
const selectedText = ref('')
const selectionStart = ref(0)
const selectionEnd = ref(0)

function handleSelection(e: any) {
  const el = e.target as HTMLTextAreaElement
  const start = el.selectionStart
  const end = el.selectionEnd

  if (start !== end) {
    selectedText.value = el.value.substring(start, end)
    selectionStart.value = start
    selectionEnd.value = end

    // Very basic positioning for MVP: near the cursor
    // In a real app, we'd use a mirror div to get exact pixel coords
    showFloatingBar.value = true
    floatingPos.value = {
      top: 100, // Fixed top for now to avoid complexity of textarea positioning
      left: 300,
    }
  }
  else {
    showFloatingBar.value = false
  }
}

async function runAIAction(type: 'continue' | 'polish' | 'expand' | 'shorten') {
  showFloatingBar.value = false
  activeContextTab.value = 'ai'

  let prompt = ''
  if (type === 'continue') {
    prompt = `Continue writing the story from this exact point. Stay consistent with the current style and tone. Current draft ending: "${draft.value.slice(-500)}"`
  }
  else {
    prompt = `Please ${type === 'polish' ? 'polish and improve the prose of' : type === 'expand' ? 'expand and add more sensory details to' : 'summarize and make more concise'} the following text while maintaining its core meaning: "${selectedText.value}"`
  }

  toast.add(`AI ${type} started...`, 'info')

  // Wait for tab to switch and ref to be available
  setTimeout(() => {
    if (aiSidebarRef.value) {
      aiSidebarRef.value.sendMessage(prompt)
    }
  }, 100)

  // Initialize pending result with current state
  pendingAIResult.value = {
    content: '',
    source: type,
    selectionStart: selectionStart.value,
    selectionEnd: selectionEnd.value,
    originalText: selectedText.value,
  }
}

function applyAIResult(text: string) {
  // If we're coming from a streaming chat or other source, store it first
  if (!pendingAIResult.value || pendingAIResult.value.source === 'chat') {
    pendingAIResult.value = {
      content: text,
      source: 'chat',
      selectionStart: selectionStart.value,
      selectionEnd: selectionEnd.value,
      originalText: selectedText.value,
    }
  }
  else {
    pendingAIResult.value.content = text
  }
}

function confirmAIResult(action: 'insert' | 'replace' | 'backup' | 'discard') {
  if (!pendingAIResult.value)
    return

  const { content, selectionStart: start, selectionEnd: end } = pendingAIResult.value

  if (action === 'insert' || action === 'replace') {
    if (start !== end && action === 'replace') {
      draft.value = draft.value.substring(0, start) + content + draft.value.substring(end)
    }
    else {
      // Insert at current start
      draft.value = draft.value.substring(0, start) + content + draft.value.substring(start)
    }
    toast.add('AI changes applied to draft', 'success')
  }
  else if (action === 'backup') {
    versionStore.createSnapshot(projectId, currentChapterId.value, content, `AI Suggestion (${pendingAIResult.value.source})`)
    toast.add('Saved as backup version', 'success')
  }

  pendingAIResult.value = null
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || 'Loading...'" :project-id="projectId" :current-chapter="currentChapter?.title">
    <template v-if="!fullScreen" #nav>
      <!-- Mini Chapter Tree in Nav Slot -->
      <div class="h-full flex flex-col border-r border-border-light bg-bg-surface">
        <div class="flex items-center justify-between border-b border-border-light p-4">
          <NButton variant="ghost" size="sm" class="h-8 w-8 p-0 -ml-2" @click="router.back()">
            <ChevronLeft :size="20" />
          </NButton>
          <h3 class="text-xs text-text-muted font-bold tracking-widest uppercase">
            章节列表
          </h3>
          <div class="w-5" />
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            v-for="ch in chapterStore.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)"
            :key="ch.id"
            class="w-full flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-all"
            :class="currentChapterId === ch.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-secondary hover:bg-bg-subtle'"
            @click="switchChapter(ch.id)"
          >
            <span class="text-[10px] font-mono opacity-50">{{ ch.chapterNumber }}</span>
            <span class="truncate">{{ ch.title }}</span>
          </button>
        </div>
      </div>
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1.5 text-xs text-text-muted">
          <template v-if="saving">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            保存中...
          </template>
          <template v-else>
            <Clock :size="12" />
            已保存
          </template>
        </div>
        <NButton variant="ghost" size="sm" class="text-text-muted hover:text-primary" @click="handleSnapshot">
          <History :size="16" class="mr-1.5" /> 保存快照
        </NButton>
        <div class="h-4 w-px bg-border-light" />
        <div class="text-xs text-text-muted font-medium">
          {{ wordCount }} 字
        </div>
        <NButton variant="ghost" size="sm" @click="fullScreen = !fullScreen">
          <component :is="fullScreen ? Minimize2 : Maximize2" :size="16" />
        </NButton>
      </div>
    </template>

    <div class="h-full flex overflow-hidden bg-bg-page">
      <!-- Center: The Immersive Editor -->
      <main class="flex-1 overflow-y-auto scroll-smooth px-4 pb-32 pt-16">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!currentChapterId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
          <PenLine :size="64" stroke-width="1" class="mb-4" />
          <p>请选择一个章节开始创作</p>
        </div>

        <div v-else class="mx-auto max-w-[760px] space-y-12">
          <!-- Chapter Title Display -->
          <div class="text-center space-y-2">
            <div class="text-[10px] text-text-muted font-bold tracking-[0.2em] uppercase">
              第 {{ currentChapter?.chapterNumber }} 章
            </div>
            <h1 class="text-4xl text-text-primary leading-tight font-writing">
              {{ currentChapter?.title }}
            </h1>
            <div class="mt-4 flex items-center justify-center gap-2">
              <NButton variant="ghost" size="sm" class="text-text-muted hover:text-primary" @click="router.push({ path: `/project/${projectId}/versions`, query: { chapter: currentChapterId } })">
                <History :size="12" class="mr-1" /> 查看版本历史
              </NButton>
            </div>
            <div class="bg-border-default mx-auto mt-6 h-0.5 w-12" />
          </div>

          <!-- P1: AI Result Confirmation Panel -->
          <Transition
            enter-active-class="transition duration-300 ease-out"
            enter-from-class="opacity-0 translate-y-4"
            enter-to-class="opacity-100 translate-y-0"
          >
            <div v-if="pendingAIResult && pendingAIResult.content" class="border border-ai/20 rounded-2xl bg-ai-soft/30 p-6 shadow-xl backdrop-blur-sm space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Sparkles :size="20" class="animate-pulse text-ai" />
                  <div>
                    <h3 class="text-sm text-ai font-bold tracking-wider uppercase">
                      AI 创作迭代建议
                    </h3>
                    <p class="text-[10px] text-text-muted uppercase">
                      等待确认
                    </p>
                  </div>
                </div>
                <NButton variant="ghost" size="sm" @click="confirmAIResult('discard')">
                  放弃
                </NButton>
              </div>

              <div class="max-h-64 overflow-y-auto border border-ai/10 rounded-xl bg-bg-surface p-4 text-sm text-text-primary leading-relaxed">
                {{ pendingAIResult.content }}
              </div>

              <div v-if="pendingAIResult.originalText" class="px-2 text-[10px] text-text-muted italic">
                将替换: "{{ pendingAIResult.originalText.substring(0, 40) }}..."
              </div>

              <div class="grid grid-cols-2 items-center gap-3 sm:flex">
                <NButton v-if="pendingAIResult.originalText" class="flex-1" variant="ai" @click="confirmAIResult('replace')">
                  替换选中项
                </NButton>
                <NButton class="flex-1" variant="ai" @click="confirmAIResult('insert')">
                  {{ pendingAIResult.originalText ? '在选中处插入' : '在光标处插入' }}
                </NButton>
                <NButton class="flex-1" variant="secondary" @click="confirmAIResult('backup')">
                  存为备份版本
                </NButton>
              </div>
            </div>
          </Transition>

          <!-- Editor Plane -->
          <div class="relative">
            <textarea
              ref="editorRef"
              v-model="draft"
              class="min-h-[600px] w-full resize-none border-none bg-transparent text-lg text-text-primary leading-[2] font-writing placeholder:text-text-muted/30 focus:outline-none focus:ring-0"
              placeholder="Once upon a time..."
              @select="handleSelection"
            />

            <!-- Phase 8: Floating Toolbar -->
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
            >
              <div
                v-if="showFloatingBar"
                class="border-border-default absolute z-50 flex items-center gap-1 border rounded-lg bg-bg-surface p-1 shadow-lg"
                :style="{ top: `-48px`, left: `50%`, transform: 'translateX(-50%)' }"
              >
                <NButton size="sm" variant="ai" class="h-8 px-2 py-0 text-[10px]" @click="runAIAction('continue')">
                  <Sparkles :size="10" class="mr-1" /> 续写
                </NButton>
                <div class="mx-1 h-4 w-px bg-border-light" />
                <NButton size="sm" variant="ghost" class="h-8 px-2 py-0 text-[10px]" @click="runAIAction('polish')">
                  润色
                </NButton>
                <NButton size="sm" variant="ghost" class="h-8 px-2 py-0 text-[10px]" @click="runAIAction('expand')">
                  扩写
                </NButton>
                <NButton size="sm" variant="ghost" class="h-8 px-2 py-0 text-[10px]" @click="runAIAction('shorten')">
                  精简
                </NButton>
                <button class="p-1.5 text-text-muted hover:text-text-primary" @click="showFloatingBar = false">
                  <X :size="12" />
                </button>
              </div>
            </Transition>
          </div>

          <!-- Bottom Indicator -->
          <div class="flex items-center justify-center pb-10 pt-20 opacity-30">
            <div class="flex gap-2">
              <div v-for="i in 3" :key="i" class="h-1.5 w-1.5 rounded-full bg-text-muted" />
            </div>
          </div>
        </div>
      </main>

      <!-- Right: Context Reference Panel -->
      <aside v-if="!fullScreen" class="hidden w-90 shrink-0 flex-col border-l border-border-light bg-bg-surface xl:flex">
        <!-- Tabs Header -->
        <div class="flex border-b border-border-light bg-bg-page/50 p-2">
          <button
            v-for="tab in [{ id: 'outline', label: '大纲', icon: ScrollText }, { id: 'characters', label: '人物', icon: Users }, { id: 'bible', label: '世界', icon: BookOpen }, { id: 'ai', label: 'AI', icon: Sparkles }]"
            :key="tab.id"
            class="flex flex-1 items-center justify-center gap-2 rounded-md px-1 py-2 text-xs font-bold tracking-wider uppercase transition-all"
            :class="activeContextTab === tab.id ? 'bg-bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'"
            @click="activeContextTab = tab.id"
          >
            <component :is="tab.icon" :size="14" />
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <!-- Outline Tab -->
          <div v-if="activeContextTab === 'outline'" class="space-y-6">
            <div v-if="currentChapter?.goals">
              <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
                创作目标
              </h4>
              <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                {{ currentChapter.goals }}
              </p>
            </div>
            <div v-if="currentChapter?.events">
              <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
                关键事件
              </h4>
              <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                {{ currentChapter.events }}
              </p>
            </div>
            <div v-if="currentChapter?.endingHook">
              <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
                结尾悬念
              </h4>
              <p class="whitespace-pre-wrap text-sm text-primary leading-relaxed italic">
                {{ currentChapter.endingHook }}
              </p>
            </div>
          </div>

          <!-- Characters Tab -->
          <div v-if="activeContextTab === 'characters'" class="space-y-4">
            <div v-if="presentCharacters.length === 0" class="py-10 text-center opacity-30">
              <Users :size="48" class="mx-auto mb-2" />
              <p class="text-xs">
                本章未关联角色。
              </p>
            </div>
            <div
              v-for="char in presentCharacters"
              :key="char.id"
              class="border border-border-light rounded-xl bg-bg-page/30 p-4 space-y-3"
            >
              <div class="flex items-center gap-2">
                <div class="h-2 w-2 rounded-full bg-primary/40" />
                <span class="text-sm text-text-primary font-bold">{{ char.name }}</span>
                <NTag v-if="char.role" size="sm" variant="ai">
                  {{ char.role }}
                </NTag>
              </div>
              <div class="space-y-2">
                <div v-if="char.personality" class="text-xs">
                  <span class="block text-[9px] text-text-muted font-bold uppercase">性格特征</span>
                  <p class="line-clamp-2 text-text-secondary leading-relaxed">
                    {{ char.personality }}
                  </p>
                </div>
                <div v-if="char.goal" class="text-xs">
                  <span class="block text-[9px] text-text-muted font-bold uppercase">核心目标</span>
                  <p class="text-text-secondary leading-relaxed">
                    {{ char.goal }}
                  </p>
                </div>
                <div v-if="char.secret" class="border border-ai/5 rounded bg-ai-soft/30 p-2 text-xs">
                  <span class="block text-[9px] text-ai font-bold uppercase">不为人知的秘密</span>
                  <p class="text-ai/80 leading-relaxed italic">
                    {{ char.secret }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Bible Tab -->
          <div v-if="activeContextTab === 'bible'" class="space-y-6">
            <div v-if="bibleStore.storyBible?.worldview">
              <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
                世界观设定
              </h4>
              <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                {{ bibleStore.storyBible.worldview }}
              </p>
            </div>
            <div v-if="bibleStore.storyBible?.rules">
              <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
                铁律与禁忌
              </h4>
              <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                {{ bibleStore.storyBible.rules }}
              </p>
            </div>
          </div>

          <!-- AI Tab -->
          <div v-if="activeContextTab === 'ai'" class="h-full">
            <AIAssistantSidebar
              ref="aiSidebarRef"
              :project-id="projectId"
              :context="`Setting: ${bibleStore.storyBible?.worldview || ''}. Current Chapter Outline: ${currentChapter?.goals || ''}`"
              @apply="applyAIResult"
            />
          </div>
        </div>

        <!-- AI Assistant Footer (Optional, since we have a tab now, we can hide this or keep as quick action) -->
        <div v-if="activeContextTab !== 'ai'" class="border-t border-border-light bg-bg-page/30 p-4">
          <div
            class="group flex cursor-pointer items-center gap-3 border border-ai/10 rounded-lg bg-ai-soft/50 p-3 transition-colors hover:bg-ai-soft"
            @click="activeContextTab = 'ai'"
          >
            <Sparkles :size="18" class="text-ai" />
            <div class="flex-1">
              <p class="text-[10px] text-ai font-bold uppercase">
                AI 创作辅助
              </p>
              <p class="text-xs text-text-secondary">
                随时为你续写、润色或提炼灵感。
              </p>
            </div>
            <ChevronRight :size="14" class="text-ai opacity-0 transition-opacity group-hover:opacity-100" />
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
/* Ensure line-height is comfortable */
textarea {
  min-height: calc(100vh - 300px);
}
</style>
