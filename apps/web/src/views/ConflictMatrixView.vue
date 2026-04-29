<script setup lang="ts">
import type { ConflictStatus, ConflictType } from '@ai-novel/shared'
import type { Component } from 'vue'
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NLoadingState,
  NTag,
  NTextArea,
  useToast,
} from '@ai-novel/ui'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  Flame,
  HelpCircle,
  LayoutGrid,
  Plus,
  Trash2,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import {
  useCharacterStore,
  useConflictStore,
  useProjectStore,
} from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const characterStore = useCharacterStore()
const conflictStore = useConflictStore()

const loading = ref(true)
const saving = ref(false)
const selectedConflictId = ref<string | null>(null)

// Form state
const conflictForm = ref({
  title: '',
  type: 'external' as ConflictType,
  intensity: 5,
  status: 'latent' as ConflictStatus,
  description: '',
  resolution: '',
  participants: [] as string[],
})

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
      conflictStore.fetchConflicts(projectId),
    ])

    if (conflictStore.conflicts.length > 0) {
      selectConflict(conflictStore.conflicts[0].id)
    }
  }
  catch {
    toast.add('Failed to load conflicts', 'error')
  }
  finally {
    loading.value = false
  }
})

function selectConflict(id: string) {
  selectedConflictId.value = id
  const conf = conflictStore.conflicts.find(c => c.id === id)
  if (conf) {
    conflictForm.value = {
      ...conf,
      description: conf.description || '',
      participants: conf.participants ? JSON.parse(conf.participants) : [],
      resolution: conf.resolution || '',
    }
  }
}

async function handleAdd() {
  try {
    const newConf = await conflictStore.createConflict(projectId, {
      title: 'New Conflict',
      type: 'external',
      intensity: 3,
      status: 'latent',
      description: 'Define the core motivation of this struggle.',
    })
    toast.add('Conflict added', 'success')
    selectConflict(newConf.id)
  }
  catch {
    toast.add('Failed to add conflict', 'error')
  }
}

async function handleSave() {
  if (!selectedConflictId.value)
    return
  saving.value = true
  try {
    const data = {
      ...conflictForm.value,
      participants: JSON.stringify(conflictForm.value.participants),
    }
    await conflictStore.updateConflict(projectId, selectedConflictId.value, data)
    toast.add('Conflict updated', 'success')
  }
  catch {
    toast.add('Failed to save', 'error')
  }
  finally {
    saving.value = false
  }
}

const showDeleteConfirm = ref(false)

function confirmDelete() {
  if (!selectedConflictId.value)
    return
  showDeleteConfirm.value = true
}

async function handleConfirmDelete() {
  if (!selectedConflictId.value)
    return
  try {
    await conflictStore.deleteConflict(projectId, selectedConflictId.value)
    toast.add('Conflict deleted', 'success')
    selectedConflictId.value = null
  }
  catch {
    toast.add('Failed to delete', 'error')
  }
  finally {
    showDeleteConfirm.value = false
  }
}

function toggleParticipant(id: string) {
  const index = conflictForm.value.participants.indexOf(id)
  if (index === -1)
    conflictForm.value.participants.push(id)
  else conflictForm.value.participants.splice(index, 1)
}

const statusOptions: Array<{ value: ConflictStatus, label: string, icon: Component, color: string, bg: string }> = [
  { value: 'latent', label: '潜伏 / 萌芽', icon: HelpCircle, color: 'text-text-muted', bg: 'bg-bg-subtle' },
  { value: 'forming', label: '成型期', icon: AlertCircle, color: 'text-info', bg: 'bg-info/10' },
  { value: 'escalating', label: '激化中', icon: TrendingUp, color: 'text-warning', bg: 'bg-warning/10' },
  { value: 'exploding', label: '顶点 / 爆发', icon: Flame, color: 'text-semantic-error', bg: 'bg-semantic-error/10' },
  { value: 'resolved', label: '已解决', icon: CheckCircle2, color: 'text-semantic-success', bg: 'bg-semantic-success/10' },
]

function getStatusStyle(status: string) {
  return statusOptions.find(s => s.value === status)
}

const types = [
  { value: 'external', label: '外部矛盾（角色 vs 他人/世界）' },
  { value: 'internal', label: '内部矛盾（角色 vs 自我）' },
]
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || 'Loading...'"
    :project-id="projectId"
  >
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

    <div class="h-full flex overflow-hidden bg-bg-page">
      <!-- Left: Conflict List -->
      <aside class="w-80 flex shrink-0 flex-col border-r border-border-light bg-bg-surface">
        <div class="flex items-center justify-between border-b border-border-light p-4 text-sm text-text-primary font-bold tracking-wider uppercase">
          <div class="flex items-center gap-2">
            <NButton variant="ghost" size="sm" class="h-8 w-8 p-0 -ml-2" @click="router.back()">
              <ChevronLeft :size="18" />
            </NButton>
            <Zap :size="16" /> 矛盾矩阵
          </div>
          <NButton variant="ghost" size="sm" @click="handleAdd">
            <Plus :size="16" />
          </NButton>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            v-for="conf in conflictStore.conflicts"
            :key="conf.id"
            class="group w-full border rounded-xl px-4 py-4 text-left transition-all"
            :class="selectedConflictId === conf.id
              ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/10'
              : 'border-transparent hover:bg-bg-subtle text-text-secondary'"
            @click="selectConflict(conf.id)"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs font-bold" :class="selectedConflictId === conf.id ? 'text-primary' : 'text-text-primary'">{{ conf.title }}</span>
              <component :is="getStatusStyle(conf.status)?.icon || HelpCircle" :size="14" :class="getStatusStyle(conf.status)?.color" />
            </div>
            <div class="flex items-center gap-2">
              <NTag size="sm" variant="ai">
                {{ conf.type }}
              </NTag>
              <div class="h-1 flex-1 overflow-hidden rounded-full bg-border-light">
                <div class="h-full bg-primary" :style="{ width: `${conf.intensity * 10}%` }" />
              </div>
            </div>
          </button>
        </div>
      </aside>

      <!-- Center: Details -->
      <main class="flex-1 overflow-y-auto bg-bg-page p-8">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!selectedConflictId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
          <LayoutGrid :size="64" stroke-width="1" class="mb-4" />
          <p>选择一个矛盾以规划其生命周期</p>
        </div>

        <div v-else class="animate-in fade-in slide-in-from-bottom-2 mx-auto max-w-3xl duration-300 space-y-10">
          <header class="flex items-center justify-between">
            <div class="mr-8 flex-1">
              <input
                v-model="conflictForm.title"
                class="w-full border-none bg-transparent p-0 text-3xl text-text-primary font-bold focus:outline-none focus:ring-0"
                placeholder="矛盾名称"
              >
            </div>
            <div class="flex gap-2">
              <NButton variant="ghost" size="sm" class="text-semantic-error" @click="confirmDelete">
                <Trash2 :size="16" />
              </NButton>
              <NButton variant="primary" size="sm" :loading="saving" @click="handleSave">
                保存冲突计划
              </NButton>
            </div>
          </header>

          <!-- Status Tracker -->
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="item in statusOptions"
              :key="item.value"
              class="flex flex-col items-center gap-2 border rounded-xl p-3 transition-all"
              :class="conflictForm.status === item.value
                ? `${item.bg} ${item.color} border-primary/20 shadow-sm ring-1 ring-primary/5`
                : 'bg-bg-surface border-border-light text-text-muted hover:border-text-muted'"
              @click="conflictForm.status = item.value"
            >
              <component :is="item.icon" :size="20" />
              <span class="h-4 text-center text-[9px] font-bold tracking-tighter uppercase">{{ item.label }}</span>
            </button>
          </div>

          <div class="grid gap-8 md:grid-cols-2">
            <div class="space-y-6">
              <div class="space-y-2">
                <label class="text-xs text-text-muted font-bold tracking-wider uppercase">矛盾范畴</label>
                <select v-model="conflictForm.type" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option v-for="t in types" :key="t.value" :value="t.value">
                    {{ t.label }}
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <label class="text-xs text-text-muted font-bold tracking-wider uppercase">矛盾烈度 (1-10)</label>
                <div class="flex items-center gap-4">
                  <input v-model.number="conflictForm.intensity" type="range" min="1" max="10" class="flex-1 accent-primary">
                  <span class="w-8 text-center text-primary font-bold">{{ conflictForm.intensity }}</span>
                </div>
              </div>
              <div class="space-y-3">
                <label class="flex items-center gap-2 text-xs text-text-muted font-bold tracking-wider uppercase">
                  <Users :size="14" /> 相关当事人
                </label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="char in characterStore.characters"
                    :key="char.id"
                    class="border rounded-full px-3 py-1 text-xs transition-all"
                    :class="conflictForm.participants.includes(char.id)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-bg-surface text-text-muted border-border-light hover:border-text-muted'"
                    @click="toggleParticipant(char.id)"
                  >
                    {{ char.name }}
                  </button>
                </div>
              </div>
            </div>

            <div class="space-y-6">
              <NTextArea v-model="conflictForm.description" label="冲突核心" placeholder="矛盾的起因是什么？为什么它不可调和？" :rows="5" />
              <NTextArea v-model="conflictForm.resolution" label="潜在解决方案" placeholder="这件事将如何收尾？胜利的代价是什么？" :rows="5" />
            </div>
          </div>

          <!-- Planning Note -->
          <div class="flex gap-4 border border-accent/10 rounded-2xl bg-accent-soft/30 p-4">
            <TrendingUp :size="20" class="mt-1 shrink-0 text-accent" />
            <div>
              <p class="mb-1 text-sm text-text-primary font-bold">
                叙事曲线助手
              </p>
              <p class="text-xs text-text-secondary leading-relaxed">
                一个引人入胜的故事通常包含从**潜伏**到**激化**的矛盾过程。
                **顶点爆发**点即是你的剧情高潮。仔细追踪这一过程，确保你的叙事节奏不会拖沓。
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
    <NConfirmDialog
      v-model="showDeleteConfirm"
      title="删除矛盾项"
      description="你确定要删除这个矛盾吗？系统将从项目中移除此项记录，且此操作不可撤销。"
      confirm-text="确定删除"
      variant="danger"
      @confirm="handleConfirmDelete"
    />
  </NAppLayout>
</template>

<style scoped>
.animate-in {
  animation: animate-in 0.3s ease-out;
}
@keyframes animate-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
