<script setup lang="ts">
import { NAppLayout, useToast } from '@ai-novel/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { triggerChapterPostprocess } from '../api/ai'
import AIPendingResultPanel from '../features/writing/components/AIPendingResultPanel.vue'
import AssemblePreviewOverlay from '../features/writing/components/AssemblePreviewOverlay.vue'
import ChapterNavigator from '../features/writing/components/ChapterNavigator.vue'
import EditorPane from '../features/writing/components/EditorPane.vue'
import SceneDraftPanel from '../features/writing/components/SceneDraftPanel.vue'
import WritingContextPanel from '../features/writing/components/WritingContextPanel.vue'
import WritingHeaderActions from '../features/writing/components/WritingHeaderActions.vue'
import { useAIResultConfirm } from '../features/writing/composables/useAIResultConfirm'
import { useSceneDraft } from '../features/writing/composables/useSceneDraft'
import { useWritingDraft } from '../features/writing/composables/useWritingDraft'
import { useChapterElementStore } from '../stores/chapter-element.store'
import { useChapterStore } from '../stores/chapter.store'
import { useCharacterStore } from '../stores/character.store'
import { useProjectStore } from '../stores/project.store'
import { useSceneStore } from '../stores/scene.store'
import { useStoryBibleStore } from '../stores/story-bible.store'
import { useVersionStore } from '../stores/version.store'

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

const projectSummary = computed(() => {
  const p = projectStore.currentProject
  if (!p)
    return ''
  return `书名：《${p.title}》\n类型：${p.genre || '未设定'}\n主题：${p.theme || '未设定'}\n简介：${p.description || '未设定'}`
})

const storyPath = computed(() => {
  if (!currentChapter.value || chapterStore.chapters.length === 0)
    return ''

  const sortedChapters = [...chapterStore.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)
  const previousChapters = sortedChapters.filter(c => c.chapterNumber < (currentChapter.value?.chapterNumber || 0))

  if (previousChapters.length === 0)
    return ''

  return previousChapters
    .map(c => `第 ${c.chapterNumber} 章《${c.title}》：${c.summary || '（尚未总结）'}`)
    .join('\n')
})

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
  updateConsistency,
  confirmAIResult,
  buildAIPrompt,
  initPendingResult,
  clearPendingResult,
} = useAIResultConfirm(activeContent, selectedText, selectionStart, selectionEnd)

// --- Refs for child components ---
const contextPanelRef = ref<InstanceType<typeof WritingContextPanel> | null>(null)

// --- Data loading ---
onMounted(async () => {
  try {
    const promises: Promise<any>[] = [
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
      bibleStore.fetchStoryBible(projectId),
    ]

    // Only fetch chapters if the list is empty to prevent overwriting local updates (e.g. from version restore)
    if (chapterStore.chapters.length === 0) {
      promises.push(chapterStore.fetchChapters(projectId))
    }

    await Promise.all(promises)

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
  if (newCh) {
    loadChapter(newCh)
    // Clear AI suggestions when chapter content is refreshed from store (e.g. restored from history)
    clearPendingResult()
  }
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

function handleRunAI(type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft' | 'quality') {
  if (sceneMode.value && !currentSceneId.value) {
    toast.add('请先选择一个场景，再使用 AI 生成内容。', 'warning')
    return
  }

  const actionLabels = {
    continue: '续写',
    polish: '润色',
    expand: '扩写',
    shorten: '精简',
    draft: '起草初稿',
    quality: '内容审计',
  }
  const sceneMap = {
    continue: 'draft' as const,
    expand: 'draft' as const,
    draft: 'draft' as const,
    polish: 'polish' as const,
    shorten: 'polish' as const,
    quality: 'quality' as const,
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
    onExtractTitle: (title) => {
      if (currentChapterId.value) {
        chapterStore.updateChapter(projectId, currentChapterId.value, { title })
      }
    },
  })
  if (sceneMode.value && (action === 'insert' || action === 'replace')) {
    await handleSceneSave()
  }
  else {
    await handleSave()
  }
}

async function handleInsertAI(content: string, metadata?: { provider?: string, model?: string, requestId?: string }) {
  const start = selectionStart.value
  const end = selectionEnd.value
  if (start !== end) {
    activeContent.value = activeContent.value.substring(0, start) + content + activeContent.value.substring(end)
  }
  else {
    activeContent.value = activeContent.value.substring(0, start) + content + activeContent.value.substring(start)
  }

  // Update pending result metadata if it matches
  if (pendingAIResult.value && pendingAIResult.value.content === content) {
    pendingAIResult.value.modelProvider = metadata?.provider
    pendingAIResult.value.modelName = metadata?.model
    pendingAIResult.value.contextSnapshotId = metadata?.requestId
  }

  toast.add('已应用到编辑器', 'success')
  if (sceneMode.value) {
    await handleSceneSave()
  }
  else {
    await handleSave()
  }
}

const updatingMemory = ref(false)

async function handleUpdateMemory() {
  if (!currentChapterId.value || !draft.value)
    return
  updatingMemory.value = true
  try {
    const result = await triggerChapterPostprocess(projectId, currentChapterId.value, draft.value) as { warnings?: string[] }

    // Refresh chapter data to get newly associated characters
    await chapterStore.fetchChapters(projectId)

    if (result.warnings && result.warnings.length > 0) {
      toast.add(`章节记忆已更新（${result.warnings.join('；')}）`, 'warning')
    }
    else {
      toast.add('章节记忆已更新', 'success')
    }
  }
  catch (e: unknown) {
    toast.add(e instanceof Error ? e.message : '章节记忆更新失败', 'error')
  }
  finally {
    updatingMemory.value = false
  }
}

function handleApplyAIResult(content: string, metadata?: any) {
  applyAIResult(content, { provider: metadata?.provider, model: metadata?.model, snapshotId: metadata?.requestId })
}

function handleStreamAIResult(content: string, metadata?: any) {
  applyAIResult(content, { provider: metadata?.provider, model: metadata?.model, snapshotId: metadata?.requestId })
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
      <WritingHeaderActions
        v-model:scene-mode="sceneMode"
        v-model:full-screen="fullScreen"
        :scene-save-error="!!sceneSaveError"
        :active-saving="activeSaving"
        :active-word-count="activeWordCount"
        :updating-memory="updatingMemory"
        :draft-exists="!!draft"
        @snapshot="handleSnapshot"
        @update-memory="handleUpdateMemory"
        @run-quality-audit="handleRunAI('quality')"
      />
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
      <AssemblePreviewOverlay
        :preview="assemblePreview"
        @confirm="confirmAssemble"
        @cancel="assemblePreview = null"
      />

      <EditorPane
        :model-value="sceneMode ? sceneContent : draft"
        :loading="loading"
        :current-chapter="currentChapter"
        :current-chapter-id="currentChapterId"
        :project-id="projectId"
        :saving="activeSaving"
        :word-count="activeWordCount"
        :has-pending-result="!!pendingAIResult"
        @update:model-value="sceneMode ? (sceneContent = $event) : (draft = $event)"
        @save="sceneMode ? handleSceneSave() : handleSave()"
        @snapshot="handleSnapshot"
        @selection="handleSelection"
        @run-ai="handleRunAI"
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
            :project-id="projectId"
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
        :project-summary="projectSummary"
        :story-path="storyPath"
        @apply-a-i="handleApplyAIResult"
        @insert-a-i="handleInsertAI"
        @consistency-check="updateConsistency($event.report, $event.loading)"
        @run-ai="handleRunAI"
        @stream-a-i="handleStreamAIResult"
      />
    </div>
  </NAppLayout>
</template>
