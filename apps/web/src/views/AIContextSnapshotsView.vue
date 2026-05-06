<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NLoadingState,
  useToast,
} from '@ai-novel/ui'
import { Bug, ChevronLeft } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useAIContextSnapshotStore, useProjectStore } from '../stores/projects'

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const snapshotStore = useAIContextSnapshotStore()

const loading = ref(true)
const selectedId = ref<string | null>(null)

const selectedSnapshot = computed(() => {
  if (!selectedId.value)
    return null
  return snapshotStore.snapshots.find(s => s.id === selectedId.value) || snapshotStore.selected
})

const parsedPayload = computed(() => {
  if (!selectedSnapshot.value?.contextPayload)
    return null
  try {
    return JSON.parse(selectedSnapshot.value.contextPayload)
  }
  catch {
    return null
  }
})

const sceneLabels: Record<string, string> = {
  outline: '大纲',
  draft: '起草',
  polish: '润色',
  quality: '质量审查',
  chat: '自由对话',
}

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      snapshotStore.fetchSnapshots(projectId),
    ])
  }
  catch {
    toast.add('加载数据失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function selectSnapshot(id: string) {
  if (selectedId.value === id) {
    selectedId.value = null
    return
  }
  selectedId.value = id
  try {
    await snapshotStore.fetchSnapshot(projectId, id)
  }
  catch {
    toast.add('加载快照详情失败', 'error')
  }
}
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
  >
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full overflow-y-auto p-6">
      <div class="mb-6">
        <h1 class="text-lg text-text-primary font-bold">
          上下文调试
        </h1>
        <p class="text-sm text-text-muted">
          查看 AI 生成请求的上下文快照，排查上下文工程问题
        </p>
      </div>

      <NLoadingState v-if="loading" />
      <div v-else-if="snapshotStore.snapshots.length === 0" class="py-12 text-center text-text-muted">
        <Bug :size="32" class="mx-auto mb-3 opacity-40" />
        <p class="text-sm">
          暂无上下文快照，发送一次 AI 生成请求后即可查看
        </p>
      </div>
      <div v-else class="flex gap-6">
        <!-- Snapshot list -->
        <div class="w-80 shrink-0 space-y-2">
          <div
            v-for="snap in snapshotStore.snapshots"
            :key="snap.id"
            class="cursor-pointer border rounded-lg p-3 transition-colors"
            :class="selectedId === snap.id ? 'border-primary bg-primary/5' : 'border-border-light bg-bg-surface hover:border-border-default'"
            @click="selectSnapshot(snap.id)"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm text-text-primary font-medium">
                {{ sceneLabels[snap.scene || ''] || snap.scene }}
              </span>
              <span class="text-xs text-text-muted">
                {{ snap.createdAt?.slice(0, 16)?.replace('T', ' ') }}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2 text-xs text-text-muted">
              <span v-if="snap.modelName">{{ snap.modelName }}</span>
              <span v-if="snap.tokenEstimate">~{{ snap.tokenEstimate }} tokens</span>
            </div>
          </div>
        </div>

        <!-- Snapshot detail -->
        <div v-if="selectedSnapshot" class="min-w-0 flex-1 space-y-4">
          <div class="flex items-center gap-2">
            <NButton variant="ghost" size="sm" @click="selectedId = null">
              <ChevronLeft :size="14" />
            </NButton>
            <h2 class="text-base text-text-primary font-semibold">
              快照详情
            </h2>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="border border-border-light rounded-lg bg-bg-surface p-3">
              <p class="text-xs text-text-muted">
                请求 ID
              </p>
              <p class="mt-1 truncate text-sm text-text-primary font-mono">
                {{ selectedSnapshot.requestId }}
              </p>
            </div>
            <div class="border border-border-light rounded-lg bg-bg-surface p-3">
              <p class="text-xs text-text-muted">
                模型
              </p>
              <p class="mt-1 text-sm text-text-primary">
                {{ selectedSnapshot.modelProvider }} / {{ selectedSnapshot.modelName || '-' }}
              </p>
            </div>
            <div class="border border-border-light rounded-lg bg-bg-surface p-3">
              <p class="text-xs text-text-muted">
                Token 估算
              </p>
              <p class="mt-1 text-sm text-text-primary">
                {{ selectedSnapshot.tokenEstimate || '-' }}
              </p>
            </div>
          </div>

          <!-- Context payload -->
          <div v-if="parsedPayload" class="space-y-3">
            <h3 class="text-sm text-text-primary font-semibold">
              上下文结构
            </h3>
            <div class="space-y-2">
              <div
                v-for="(value, key) in parsedPayload"
                :key="key"
                class="border border-border-light rounded-lg bg-bg-surface p-3"
              >
                <p class="text-xs text-text-muted font-medium">
                  {{ key }}
                </p>
                <pre class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-text-secondary">{{ typeof value === 'string' ? value : JSON.stringify(value, null, 2) }}</pre>
              </div>
            </div>
          </div>

          <!-- Rendered prompt preview -->
          <div v-if="selectedSnapshot.renderedPromptPreview">
            <h3 class="mb-2 text-sm text-text-primary font-semibold">
              渲染后 Prompt 预览
            </h3>
            <pre class="max-h-96 overflow-auto whitespace-pre-wrap border border-border-light rounded-lg bg-bg-surface p-4 text-xs text-text-secondary">{{ selectedSnapshot.renderedPromptPreview }}</pre>
          </div>
        </div>

        <div v-else class="flex flex-1 items-center justify-center text-text-muted">
          <p class="text-sm">
            选择左侧快照查看详情
          </p>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
