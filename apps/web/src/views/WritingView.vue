<script setup lang="ts">
import { NAppLayout, NButton, useToast } from '@ai-novel/ui'
import {
  Clock,
  History,
  Maximize2,
  Minimize2,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AIPendingResultPanel from '../features/writing/components/AIPendingResultPanel.vue'
import ChapterNavigator from '../features/writing/components/ChapterNavigator.vue'
import EditorPane from '../features/writing/components/EditorPane.vue'
import WritingContextPanel from '../features/writing/components/WritingContextPanel.vue'
import { useAIResultConfirm } from '../features/writing/composables/useAIResultConfirm'
import { useWritingDraft } from '../features/writing/composables/useWritingDraft'
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
const fullScreen = ref(false)

const currentChapterId = computed(() => route.query.chapter as string)
const currentChapter = computed(() =>
  chapterStore.chapters.find(c => c.id === currentChapterId.value),
)

// --- Draft management ---
const { draft, saving, wordCount, loadChapter, handleSave } = useWritingDraft(
  projectId,
  currentChapterId,
  chapterStore,
)

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
} = useAIResultConfirm(draft, selectedText, selectionStart, selectionEnd)

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

// --- Event handlers ---
function switchChapter(id: string) {
  handleSave()
  router.push({ query: { ...route.query, chapter: id } })
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

function handleConfirmAI(action: 'insert' | 'replace' | 'backup' | 'discard') {
  confirmAIResult(action, {
    projectId,
    currentChapterId: currentChapterId.value,
    versionStore,
    toast,
  })
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
        <NButton
          variant="ghost"
          size="sm"
          class="text-text-muted hover:text-primary"
          @click="handleSnapshot"
        >
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
      <EditorPane
        v-model="draft"
        :loading="loading"
        :current-chapter="currentChapter"
        :current-chapter-id="currentChapterId"
        :project-id="projectId"
        :saving="saving"
        :word-count="wordCount"
        @save="handleSave"
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
        :project-id="projectId"
        @apply-a-i="applyAIResult"
      />
    </div>
  </NAppLayout>
</template>
