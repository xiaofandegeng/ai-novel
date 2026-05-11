<script setup lang="ts">
import { NAppLayout, NButton, useToast } from '@ai-novel/ui'
import {
  Brain,
  Clapperboard,
  Clock,
  History,
  Maximize2,
  Minimize2,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { triggerChapterPostprocess } from '../api/ai'
import AIPendingResultPanel from '../features/writing/components/AIPendingResultPanel.vue'
import ChapterNavigator from '../features/writing/components/ChapterNavigator.vue'
import EditorPane from '../features/writing/components/EditorPane.vue'
import SceneDraftPanel from '../features/writing/components/SceneDraftPanel.vue'
import WritingContextPanel from '../features/writing/components/WritingContextPanel.vue'
import { useAIResultConfirm } from '../features/writing/composables/useAIResultConfirm'
import { useSceneDraft } from '../features/writing/composables/useSceneDraft'
import { useWritingDraft } from '../features/writing/composables/useWritingDraft'
import {
  useChapterElementStore,
  useChapterStore,
  useCharacterStore,
  useProjectStore,
  useSceneStore,
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
const chapterElementStore = useChapterElementStore()
const sceneStore = useSceneStore()

const loading = ref(true)
const fullScreen = ref(false)
const sceneMode = ref(false)

const currentChapterId = computed(() => route.query.chapter as string)
const currentChapter = computed(() =>
  chapterStore.chapters.find(c => c.id === currentChapterId.value),
)

const currentSceneId = computed(() => sceneStore.selectedSceneId)

// --- Draft management (chapter mode) ---
const { draft, saving, wordCount, loadChapter, handleSave } = useWritingDraft(
  projectId,
  currentChapterId,
  chapterStore,
)

// --- Scene draft management (scene mode) ---
const {
  sceneContent,
  saving: sceneSaving,
  saveError: sceneSaveError,
  dirty: _sceneDirty,
  wordCount: sceneWordCount,
  loadScene,
  handleSave: handleSceneSave,
} = useSceneDraft(
  projectId,
  currentChapterId,
  currentSceneId,
  sceneStore,
)

const activeSaving = computed(() => sceneMode.value ? sceneSaving.value : saving.value)
const activeWordCount = computed(() => sceneMode.value ? sceneWordCount.value : wordCount.value)
const activeContent = computed({
  get: () => sceneMode.value ? sceneContent.value : draft.value,
  set: (value: string) => {
    if (sceneMode.value)
      sceneContent.value = value
    else
      draft.value = value
  },
})

// --- AI result confirmation ---
const selectedText = ref('')
const selectionStart = ref(0)
const selectionEnd = ref(0)

const {
  pendingAIResult,
  applyAIResult,
  confirmAIResult,
  buildAIPrompt,
  initPendingResult,
} = useAIResultConfirm(activeContent, selectedText, selectionStart, selectionEnd)

// --- Refs for child components ---
const contextPanelRef = ref<InstanceType<typeof WritingContextPanel> | null>(null)

// --- Data loading ---
onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      chapterStore.fetchChapters(projectId),
      characterStore.fetchCharacters(projectId),
      bibleStore.fetchStoryBible(projectId),
    ])

    if (!currentChapterId.value && chapterStore.chapters.length > 0) {
      const target = chapterStore.chapters.find(c => c.status !== 'completed')
        || chapterStore.chapters[0]
      router.replace({ query: { ...route.query, chapter: target.id } })
    }
    else if (currentChapter.value) {
      loadChapter(currentChapter.value)
    }
  }
  catch {
    toast.add('写作工作区加载失败', 'error')
  }
  finally {
    loading.value = false
  }
})

watch(currentChapter, (newCh) => {
  if (newCh)
    loadChapter(newCh)
}, { immediate: true })

watch(currentChapterId, async (id) => {
  if (id) {
    await chapterElementStore.fetchElements(projectId, id)
    if (sceneMode.value) {
      await sceneStore.fetchScenes(projectId, id)
    }
  }
  else {
    chapterElementStore.clear()
    sceneStore.clear()
  }
}, { immediate: true })

watch(sceneMode, async (enabled) => {
  if (enabled && currentChapterId.value) {
    await sceneStore.fetchScenes(projectId, currentChapterId.value)
  }
  else if (!enabled) {
    sceneStore.clear()
  }
})

// --- Event handlers ---
async function switchChapter(id: string) {
  await handleSave()
  if (sceneMode.value) {
    const ok = await handleSceneSave()
    if (!ok) {
      toast.add('当前场景保存失败，请先修复后再切换章节。', 'warning')
      return
    }
  }
  router.push({ query: { ...route.query, chapter: id } })
}

async function selectScene(sceneId: string) {
  if (sceneMode.value) {
    const ok = await handleSceneSave()
    if (!ok) {
      toast.add('当前场景保存失败，请先修复后再切换场景。', 'warning')
      return
    }
  }
  const scene = sceneStore.scenes.find(s => s.id === sceneId)
  if (scene) {
    sceneStore.selectScene(sceneId)
    loadScene(scene)
  }
}

const assemblePreview = ref<{ currentWordCount: number, assembledWordCount: number, content: string, sceneCount: number } | null>(null)

function handleAssembleChapter() {
  const scenesWithContent = sceneStore.scenes
    .filter(s => s.content)
    .sort((a, b) => a.orderIndex - b.orderIndex || a.sceneNumber - b.sceneNumber)

  if (scenesWithContent.length === 0) {
    toast.add('没有可组装的场景内容', 'warning')
    return
  }

  const assembled = scenesWithContent.map(s => s.content).join('\n\n---\n\n')
  assemblePreview.value = {
    currentWordCount: (currentChapter.value?.draft || '').length,
    assembledWordCount: assembled.length,
    content: assembled,
    sceneCount: scenesWithContent.length,
  }
}

async function confirmAssemble(mode: 'replace' | 'append') {
  if (!assemblePreview.value)
    return
  const content = assemblePreview.value.content
  if (mode === 'append') {
    draft.value = (draft.value ? `${draft.value}\n\n---\n\n` : '') + content
  }
  else {
    await handleSnapshot()
    draft.value = content
  }
  await handleSave()
  toast.add(`已${mode === 'replace' ? '替换' : '追加'} ${assemblePreview.value.sceneCount} 个场景到章节草稿`, 'success')
  assemblePreview.value = null
  sceneMode.value = false
}

async function handleSnapshot() {
  if (!currentChapterId.value || !draft.value)
    return
  try {
    await versionStore.createSnapshot(
      projectId,
      currentChapterId.value,
      draft.value,
      `快照 ${new Date().toLocaleTimeString()}`,
    )
    toast.add('快照已保存到版本历史', 'success')
  }
  catch {
    toast.add('快照保存失败', 'error')
  }
}

function handleSelection(payload: { text: string, start: number, end: number }) {
  selectedText.value = payload.text
  selectionStart.value = payload.start
  selectionEnd.value = payload.end
}

function handleRunAI(type: 'continue' | 'polish' | 'expand' | 'shorten') {
  if (sceneMode.value && !currentSceneId.value) {
    toast.add('请先选择一个场景，再使用 AI 生成场景正文。', 'warning')
    return
  }

  const actionLabels = {
    continue: '续写',
    polish: '润色',
    expand: '扩写',
    shorten: '精简',
  }
  const sceneMap = {
    continue: 'draft' as const,
    expand: 'draft' as const,
    polish: 'polish' as const,
    shorten: 'polish' as const,
  }
  const prompt = buildAIPrompt(type)
  toast.add(`AI ${actionLabels[type]}已开始`, 'info')
  initPendingResult(type)

  if (contextPanelRef.value) {
    contextPanelRef.value.sendMessageToAI(prompt, sceneMap[type])
  }
}

async function handleConfirmAI(action: 'insert' | 'replace' | 'backup' | 'discard') {
  confirmAIResult(action, {
    projectId,
    currentChapterId: currentChapterId.value,
    versionStore,
    toast,
  })
  if (sceneMode.value && (action === 'insert' || action === 'replace'))
    await handleSceneSave()
}

const updatingMemory = ref(false)

async function handleUpdateMemory() {
  if (!currentChapterId.value || !draft.value)
    return
  updatingMemory.value = true
  try {
    const result = await triggerChapterPostprocess(projectId, currentChapterId.value, draft.value)
    if (result.warnings.length > 0) {
      toast.add(`章节记忆已更新（${result.warnings.join('；')}）`, 'warning')
    }
    else {
      toast.add('章节记忆已更新', 'success')
    }
  }
  catch (e: any) {
    toast.add(e.message || '章节记忆更新失败', 'error')
  }
  finally {
    updatingMemory.value = false
  }
}
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
    :current-chapter="currentChapter?.title"
  >
    <template v-if="!fullScreen" #nav>
      <ChapterNavigator
        :chapters="chapterStore.chapters"
        :current-chapter-id="currentChapterId"
        :project-id="projectId"
        @switch="switchChapter"
      />
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-4">
        <button
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          :class="sceneMode ? 'bg-primary text-white' : 'bg-bg-surface text-text-muted hover:text-primary'"
          @click="sceneMode = !sceneMode"
        >
          <Clapperboard :size="12" />
          {{ sceneMode ? '场景模式' : '章节模式' }}
        </button>
        <div class="flex items-center gap-1.5 text-xs text-text-muted">
          <template v-if="sceneMode && sceneSaveError">
            <span class="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span class="text-red-500">场景保存失败</span>
          </template>
          <template v-else-if="activeSaving">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            保存中...
          </template>
          <template v-else>
            <Clock :size="12" />
            已保存
          </template>
        </div>
        <NButton
          variant="ghost"
          size="sm"
          class="text-text-muted hover:text-primary"
          @click="handleSnapshot"
        >
          <History :size="16" class="mr-1.5" /> 保存快照
        </NButton>
        <NButton
          variant="ghost"
          size="sm"
          :disabled="!draft || updatingMemory"
          :loading="updatingMemory"
          class="text-text-muted hover:text-ai"
          @click="handleUpdateMemory"
        >
          <Brain :size="16" class="mr-1.5" /> 更新记忆
        </NButton>
        <div class="h-4 w-px bg-border-light" />
        <div class="text-xs text-text-muted font-medium">
          {{ activeWordCount }} 字
        </div>
        <NButton variant="ghost" size="sm" @click="fullScreen = !fullScreen">
          <component :is="fullScreen ? Minimize2 : Maximize2" :size="16" />
        </NButton>
      </div>
    </template>

    <div class="h-full flex overflow-hidden bg-bg-page">
      <!-- Scene panel (only in scene mode) -->
      <SceneDraftPanel
        v-if="sceneMode && !fullScreen"
        :scenes="sceneStore.scenes"
        :current-scene-id="currentSceneId"
        @select="selectScene"
        @assemble="handleAssembleChapter"
      />

      <!-- Assemble confirmation overlay -->
      <div
        v-if="assemblePreview"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      >
        <div class="max-w-lg w-full rounded-lg bg-bg-surface p-6 shadow-xl">
          <h3 class="mb-4 text-sm text-text-primary font-bold">
            确认组装章节
          </h3>
          <div class="mb-4 text-xs text-text-secondary space-y-2">
            <p>当前章节草稿：<span class="text-text-primary font-medium">{{ assemblePreview.currentWordCount }}</span> 字</p>
            <p>组装后内容：<span class="text-primary font-medium">{{ assemblePreview.assembledWordCount }}</span> 字（{{ assemblePreview.sceneCount }} 个场景）</p>
            <p v-if="assemblePreview.currentWordCount > 0" class="text-yellow-600">
              替换模式将覆盖当前章节草稿（替换前会自动保存快照）
            </p>
          </div>
          <div class="flex gap-3">
            <NButton variant="primary" size="sm" @click="confirmAssemble('replace')">
              替换章节草稿
            </NButton>
            <NButton variant="ghost" size="sm" @click="confirmAssemble('append')">
              追加到草稿末尾
            </NButton>
            <NButton variant="ghost" size="sm" @click="assemblePreview = null">
              取消
            </NButton>
          </div>
        </div>
      </div>

      <EditorPane
        :model-value="sceneMode ? sceneContent : draft"
        :loading="loading"
        :current-chapter="currentChapter"
        :current-chapter-id="currentChapterId"
        :project-id="projectId"
        :saving="activeSaving"
        :word-count="activeWordCount"
        @update:model-value="sceneMode ? (sceneContent = $event) : (draft = $event)"
        @save="sceneMode ? handleSceneSave() : handleSave()"
        @snapshot="handleSnapshot"
        @selection="handleSelection"
        @run-a-i="handleRunAI"
      >
        <template #version-history>
          <NButton
            variant="ghost"
            size="sm"
            class="text-text-muted hover:text-primary"
            @click="router.push({ path: `/project/${projectId}/versions`, query: { chapter: currentChapterId } })"
          >
            <History :size="12" class="mr-1" /> 查看版本历史
          </NButton>
        </template>
        <template #ai-pending-result>
          <AIPendingResultPanel
            :result="pendingAIResult"
            @confirm="handleConfirmAI"
          />
        </template>
      </EditorPane>

      <WritingContextPanel
        v-if="!fullScreen"
        ref="contextPanelRef"
        :chapter="currentChapter"
        :characters="characterStore.characters"
        :story-bible="bibleStore.storyBible"
        :chapter-elements="chapterElementStore.elements"
        :project-id="projectId"
        :scene-id="sceneMode ? currentSceneId : null"
        @apply-a-i="applyAIResult"
      />
    </div>
  </NAppLayout>
</template>
