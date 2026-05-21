<script setup lang="ts">
import { NButton, NEmptyState, NTag } from '@ai-novel/ui'
import {
  AlertCircle,
  ChevronRight,
  Eye,
  FileCode,
  History,
  RefreshCw,
  Search,
  Terminal,
} from 'lucide-vue-next'

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useAIContextSnapshotStore } from '../stores/ai-context-snapshot.store'

const route = useRoute()
const projectId = route.params.id as string
const snapshotStore = useAIContextSnapshotStore()

const loading = ref(false)
const selectedId = ref<string | null>(null)
const activeTab = ref<'prompt' | 'payload'>('prompt')

async function loadSnapshots() {
  loading.value = true
  try {
    await snapshotStore.fetchSnapshots(projectId)
    if (snapshotStore.snapshots.length > 0 && !selectedId.value) {
      handleSelect(snapshotStore.snapshots[0].id)
    }
  }
  finally {
    loading.value = false
  }
}

async function handleSelect(id: string) {
  selectedId.value = id
  await snapshotStore.fetchSnapshot(projectId, id)
}

const selectedSnapshot = computed(() => snapshotStore.selected)

const formattedPayload = computed(() => {
  if (!selectedSnapshot.value?.contextPayload)
    return ''
  try {
    const parsed = JSON.parse(selectedSnapshot.value.contextPayload)
    return JSON.stringify(parsed, null, 2)
  }
  catch {
    return selectedSnapshot.value.contextPayload
  }
})

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr)
    return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(dateStr))
}

onMounted(() => {
  loadSnapshots()
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden bg-bg-page p-6">
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl text-text-primary font-bold">
          <Terminal class="text-primary" :size="24" />
          AI 上下文调试器
        </h1>
        <p class="mt-1 text-sm text-text-muted">
          查看最近生成的 AI 提示词快照，调试上下文注入逻辑。
        </p>
      </div>
      <NButton :loading="loading" @click="loadSnapshots">
        <RefreshCw class="mr-2" :class="{ 'animate-spin': loading }" :size="16" />
        刷新快照
      </NButton>
    </header>

    <div class="flex flex-1 gap-6 overflow-hidden">
      <!-- Sidebar: Snapshot List -->
      <aside class="w-80 flex flex-col overflow-hidden border border-border-light rounded-xl bg-bg-surface shadow-sm">
        <div class="border-b border-border-light bg-bg-subtle/30 p-3">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 text-text-muted -translate-y-1/2" :size="14" />
            <input
              type="text"
              placeholder="搜索快照..."
              class="w-full border border-border-light rounded-md bg-bg-page py-1.5 pl-9 pr-3 text-xs transition-all focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div v-if="snapshotStore.snapshots.length === 0 && !loading" class="px-4 py-12">
            <NEmptyState title="暂无快照" description="尚未生成任何 AI 上下文快照" />
          </div>
          <div v-else class="divide-y divide-border-light/50">
            <button
              v-for="ss in snapshotStore.snapshots"
              :key="ss.id"
              class="group w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-bg-subtle"
              :class="{ 'bg-primary-soft/30': selectedId === ss.id }"
              @click="handleSelect(ss.id)"
            >
              <div class="mt-0.5">
                <History :class="selectedId === ss.id ? 'text-primary' : 'text-text-muted'" :size="14" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-xs text-text-primary font-bold">
                    {{ ss.scene === 'outline' ? '大纲生成' : ss.scene === 'draft' ? '正文生成' : 'AI 对话' }}
                  </span>
                  <span class="whitespace-nowrap text-[10px] text-text-muted">
                    {{ formatDate(ss.createdAt) }}
                  </span>
                </div>
                <p class="mt-1 truncate text-[10px] text-text-muted font-mono">
                  ID: {{ ss.requestId.slice(0, 8) }}...
                </p>
                <div class="mt-2 flex items-center gap-2">
                  <NTag v-if="ss.tokenEstimate" size="sm" variant="info">
                    {{ ss.tokenEstimate }} tokens
                  </NTag>
                  <NTag v-if="ss.modelName" size="sm">
                    {{ ss.modelName }}
                  </NTag>
                </div>
              </div>
              <ChevronRight class="text-text-muted opacity-0 transition-opacity group-hover:opacity-100" :size="14" />
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Content: Snapshot Details -->
      <main class="min-w-0 flex flex-1 flex-col overflow-hidden border border-border-light rounded-xl bg-bg-surface shadow-sm">
        <template v-if="selectedSnapshot">
          <div class="flex items-center justify-between border-b border-border-light bg-bg-subtle/30 p-4">
            <div class="flex items-center gap-4">
              <div class="flex flex-col">
                <span class="text-[10px] text-text-muted font-bold tracking-wider uppercase">请求场景</span>
                <span class="text-sm text-text-primary font-bold">{{ selectedSnapshot.scene || '未知' }}</span>
              </div>
              <div class="h-8 w-px bg-border-light" />
              <div class="flex flex-col">
                <span class="text-[10px] text-text-muted font-bold tracking-wider uppercase">生成模型</span>
                <span class="text-sm text-text-primary font-bold">{{ selectedSnapshot.modelName || '默认模型' }}</span>
              </div>
              <div class="h-8 w-px bg-border-light" />
              <div class="flex flex-col">
                <span class="text-[10px] text-text-muted font-bold tracking-wider uppercase">预估 Token</span>
                <span class="text-sm text-primary font-bold">{{ selectedSnapshot.tokenEstimate || 0 }}</span>
              </div>
            </div>

            <div class="flex gap-2">
              <NButton size="sm" variant="ghost">
                <FileCode class="mr-1" :size="14" /> 导出 JSON
              </NButton>
            </div>
          </div>

          <div class="flex flex-1 flex-col overflow-hidden">
            <div class="flex border-b border-border-light bg-bg-page/50">
              <button
                class="px-6 py-2 text-xs font-bold transition-all"
                :class="activeTab === 'prompt' ? 'text-primary border-primary border-b-2' : 'text-text-muted hover:text-text-secondary'"
                @click="activeTab = 'prompt'"
              >
                渲染提示词 (Rendered)
              </button>
              <button
                class="px-6 py-2 text-xs font-bold transition-all"
                :class="activeTab === 'payload' ? 'text-primary border-primary border-b-2' : 'text-text-muted hover:text-text-secondary'"
                @click="activeTab = 'payload'"
              >
                结构化数据 (Payload)
              </button>
            </div>

            <div class="flex-1 overflow-y-auto bg-bg-subtle/10 font-mono">
              <div class="p-6">
                <template v-if="activeTab === 'prompt'">
                  <div v-if="selectedSnapshot.renderedPromptPreview" class="whitespace-pre-wrap text-xs text-text-primary leading-relaxed">
                    {{ selectedSnapshot.renderedPromptPreview }}
                  </div>
                  <div v-else class="flex flex-col items-center justify-center py-20 text-text-muted italic">
                    <AlertCircle class="mb-2 opacity-20" :size="32" />
                    提示词预览不可用
                  </div>
                </template>
                <template v-else>
                  <pre class="text-[11px] text-text-secondary leading-normal">{{ formattedPayload }}</pre>
                </template>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="flex flex-1 flex-col items-center justify-center bg-bg-subtle/5 text-text-muted">
            <Eye class="mb-4 opacity-10" :size="48" />
            <p>请在左侧选择一个快照查看详情</p>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
