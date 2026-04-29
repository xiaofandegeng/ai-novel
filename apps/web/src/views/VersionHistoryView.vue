<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowRightLeft,
  ChevronLeft,
  Clock,
  FileText,
  History,
  Info,
  RotateCcw,
  Trash2,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import {
  useChapterStore,
  useProjectStore,
  useVersionStore,
} from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const chapterId = ref((route.query.chapter as string) || '')
const toast = useToast()

const projectStore = useProjectStore()
const chapterStore = useChapterStore()
const versionStore = useVersionStore()

const loading = ref(true)
const selectedVersionId = ref<string | null>(null)
const compareMode = ref(false)
const compareWithId = ref<string | null>(null)

const currentChapter = computed(() => chapterStore.chapters.find(c => c.id === chapterId.value))

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      chapterStore.fetchChapters(projectId),
    ])

    if (!chapterId.value) {
      chapterId.value = chapterStore.chapters[0]?.id || ''
      if (chapterId.value)
        router.replace({ path: `/project/${projectId}/versions`, query: { chapter: chapterId.value } })
    }

    if (chapterId.value)
      await versionStore.fetchVersions(projectId, chapterId.value)
  }
  catch {
    toast.add('Failed to load version history', 'error')
  }
  finally {
    loading.value = false
  }
})

const selectedVersion = computed(() => versionStore.versions.find(v => v.id === selectedVersionId.value))
const compareVersion = computed(() => versionStore.versions.find(v => v.id === compareWithId.value))

const showRestoreConfirm = ref(false)
const showDeleteSnapshotConfirm = ref(false)
const snapshotToDelete = ref<string | null>(null)

function confirmRestore() {
  if (!selectedVersion.value)
    return
  showRestoreConfirm.value = true
}

async function handleConfirmRestore() {
  try {
    if (!selectedVersion.value)
      return
    await chapterStore.updateChapter(projectId, chapterId.value, { draft: selectedVersion.value.content })
    toast.add('Version restored successfully', 'success')
    router.push({ path: `/project/${projectId}/write`, query: { chapter: chapterId.value } })
  }
  catch {
    toast.add('Failed to restore version', 'error')
  }
  finally {
    showRestoreConfirm.value = false
  }
}

function confirmDeleteSnapshot(id: string) {
  snapshotToDelete.value = id
  showDeleteSnapshotConfirm.value = true
}

async function handleConfirmDeleteSnapshot() {
  if (!snapshotToDelete.value)
    return
  try {
    await versionStore.deleteVersion(projectId, snapshotToDelete.value)
    if (selectedVersionId.value === snapshotToDelete.value)
      selectedVersionId.value = null
    toast.add('Snapshot deleted', 'success')
  }
  catch {
    toast.add('Delete failed', 'error')
  }
  finally {
    showDeleteSnapshotConfirm.value = false
    snapshotToDelete.value = null
  }
}

function selectForCompare(id: string) {
  if (selectedVersionId.value === id)
    return
  compareWithId.value = id
  compareMode.value = true
}

function formatDate(date?: string) {
  if (!date)
    return '未选择版本'
  return new Date(date).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || 'Loading...'" :project-id="projectId">
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full flex flex-col bg-bg-page">
      <header class="z-10 flex items-center justify-between border-b border-border-light bg-bg-surface p-6 shadow-sm">
        <div class="flex items-center gap-4">
          <NButton variant="ghost" size="sm" @click="router.back()">
            <ChevronLeft :size="20" />
          </NButton>
          <div>
            <h1 class="text-xl text-text-primary font-bold">
              版本历史
            </h1>
            <p class="text-xs text-text-muted">
              章节：{{ currentChapter?.title }}
            </p>
          </div>
        </div>
        <div v-if="selectedVersionId" class="flex gap-2">
          <NButton variant="ghost" size="sm" @click="compareMode = !compareMode">
            <ArrowRightLeft :size="16" class="mr-1.5" /> {{ compareMode ? '退出对比' : '开启对比模式' }}
          </NButton>
          <NButton variant="primary" size="sm" @click="confirmRestore">
            <RotateCcw :size="16" class="mr-1.5" /> 恢复此版本
          </NButton>
        </div>
      </header>

      <div class="flex flex-1 overflow-hidden">
        <!-- Left: Version Tape -->
        <aside class="w-80 flex shrink-0 flex-col overflow-y-auto border-r border-border-light bg-bg-surface p-4 space-y-3">
          <div v-if="versionStore.versions.length === 0" class="py-20 text-center opacity-30">
            <History :size="48" class="mx-auto mb-2" />
            <p class="text-sm">
              尚未生成任何快照。
            </p>
          </div>

          <button
            v-for="v in versionStore.versions"
            :key="v.id"
            class="group relative w-full border rounded-xl p-4 text-left transition-all"
            :class="selectedVersionId === v.id
              ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/10'
              : 'border-transparent hover:bg-bg-subtle text-text-secondary'"
            @click="selectedVersionId = v.id"
          >
            <div class="mb-1 flex items-center justify-between">
              <span class="flex items-center gap-2 text-xs text-text-primary font-bold">
                <Clock :size="12" class="text-text-muted" />
                {{ formatDate(v.createdAt) }}
              </span>
              <button
                class="p-1 opacity-0 hover:text-semantic-error group-hover:opacity-100"
                @click.stop="confirmDeleteSnapshot(v.id)"
              >
                <Trash2 :size="12" />
              </button>
            </div>
            <p class="mb-2 truncate text-[10px] text-text-muted">
              {{ v.note }}
            </p>
            <div class="flex items-center justify-between text-[10px]">
              <NTag size="sm" variant="ai">
                {{ v.wordCount }} 字
              </NTag>
              <button
                v-if="selectedVersionId && selectedVersionId !== v.id"
                class="text-primary font-bold hover:underline"
                @click.stop="selectForCompare(v.id)"
              >
                对比
              </button>
            </div>
          </button>
        </aside>

        <!-- Main: Preview / Diff -->
        <main class="flex flex-1 overflow-y-auto bg-bg-page">
          <div v-if="!selectedVersionId" class="flex flex-1 flex-col items-center justify-center text-text-muted opacity-30">
            <FileText :size="80" stroke-width="1" class="mb-4" />
            <p>选择一个版本以预览内容</p>
          </div>

          <!-- Single View -->
          <div v-else-if="!compareMode" class="mx-auto max-w-4xl flex-1 p-12 space-y-10 lg:p-20">
            <div class="mb-10 border-b border-border-light border-dashed p-6 text-center">
              <div class="mb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
                {{ formatDate(selectedVersion?.createdAt) }}
              </div>
              <h2 class="text-2xl text-text-primary font-writing italic">
                快照内容预览
              </h2>
            </div>
            <div class="select-text whitespace-pre-wrap text-lg text-text-primary leading-[2] font-writing">
              {{ selectedVersion?.content }}
            </div>
          </div>

          <!-- Compare View -->
          <div v-else class="h-full flex flex-1 overflow-hidden divide-x divide-border-light">
            <div class="flex flex-1 flex-col overflow-hidden">
              <div class="sticky top-0 z-10 border-b border-border-light bg-bg-subtle p-3 text-center text-[10px] text-text-muted font-bold tracking-wider uppercase">
                原始版本：{{ formatDate(selectedVersion?.createdAt) }}
              </div>
              <div class="flex-1 select-text overflow-y-auto whitespace-pre-wrap p-8 text-sm leading-relaxed font-writing opacity-60">
                {{ selectedVersion?.content }}
              </div>
            </div>
            <div class="flex flex-1 flex-col overflow-hidden bg-bg-surface shadow-[inset_0_0_20px_rgba(0,0,0,0.02)]">
              <div class="sticky top-0 z-10 border-b border-primary/10 bg-primary/5 p-3 text-center text-[10px] text-primary font-bold tracking-wider uppercase">
                正在对比：{{ compareVersion ? formatDate(compareVersion.createdAt) : '请选择一个版本...' }}
              </div>
              <div v-if="!compareVersion" class="flex flex-1 items-center justify-center text-xs text-text-muted italic">
                在左侧列表中点击“对比”按钮
              </div>
              <div v-else class="flex-1 select-text overflow-y-auto whitespace-pre-wrap border-l-4 border-primary/20 p-8 text-sm leading-relaxed font-writing">
                {{ compareVersion.content }}
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- Footer Info -->
      <footer class="flex items-center justify-center gap-4 border-t border-border-light bg-bg-surface p-3 text-[10px] text-text-muted">
        <div class="flex items-center gap-1">
          <Info :size="12" /> 恢复历史版本将覆盖当前章节的实时草稿。请务必在此之前手动保存一份快照！
        </div>
      </footer>
    </div>

    <NConfirmDialog
      v-model="showRestoreConfirm"
      title="恢复历史版本"
      description="系统将把当前章节草稿【替换】为选中的历史版本。我们强烈建议您先为当前内容保存一份快照。是否继续？"
      confirm-text="确定恢复"
      @confirm="handleConfirmRestore"
    />

    <NConfirmDialog
      v-model="showDeleteSnapshotConfirm"
      title="删除快照"
      description="这将永久删除该版本快照，且操作无法撤销。是否继续？"
      confirm-text="确定删除"
      variant="danger"
      @confirm="handleConfirmDeleteSnapshot"
    />
  </NAppLayout>
</template>

<style scoped>
.font-writing {
  font-family: serif;
}
</style>
