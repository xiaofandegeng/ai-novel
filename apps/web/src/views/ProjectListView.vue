<script setup lang="ts">
import {
  NButton,
  NConfirmDialog,
  NEmptyState,
  NInput,
  NModal,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  BarChart3,
  BookOpen,
  Clock,
  ExternalLink,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '../stores/projects'

const router = useRouter()
const projectStore = useProjectStore()
const toast = useToast()

const loading = ref(true)
const searchQuery = ref('')
const showCreateModal = ref(false)
const createError = ref('')

const form = ref({
  title: '',
  genre: '',
  theme: '',
  targetWords: '',
})

onMounted(async () => {
  try {
    await projectStore.fetchProjects()
  }
  finally {
    loading.value = false
  }
})

const filteredProjects = computed(() => {
  if (!searchQuery.value.trim())
    return projectStore.projects
  const q = searchQuery.value.toLowerCase()
  return projectStore.projects.filter((p: any) =>
    p.title.toLowerCase().includes(q)
    || (p.genre && p.genre.toLowerCase().includes(q)),
  )
})

const totalTargetWords = computed(() =>
  projectStore.projects.reduce((sum: number, project: any) => sum + (project.targetWords || 0), 0),
)

function openCreateModal() {
  form.value = { title: '', genre: '', theme: '', targetWords: '' }
  createError.value = ''
  showCreateModal.value = true
}

async function handleCreate() {
  if (!form.value.title.trim()) {
    createError.value = '项目名称不能为空'
    return
  }
  try {
    const data = {
      ...form.value,
      targetWords: form.value.targetWords ? Number(form.value.targetWords) : undefined,
    }
    const p = await projectStore.createProject(data)
    showCreateModal.value = false
    toast.add('Project created', 'success')
    router.push(`/project/${p.id}`)
  }
  catch (e: any) {
    createError.value = e.message || 'Failed to create project'
  }
}

const showDeleteConfirm = ref(false)
const projectToDelete = ref<string | null>(null)

function confirmDelete(id: string) {
  projectToDelete.value = id
  showDeleteConfirm.value = true
}

async function handleConfirmDelete() {
  if (!projectToDelete.value)
    return
  try {
    await projectStore.deleteProject(projectToDelete.value)
    toast.add('Project deleted', 'success')
  }
  catch {
    toast.add('Failed to delete', 'error')
  }
  finally {
    showDeleteConfirm.value = false
    projectToDelete.value = null
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 3600000)
    return '刚刚'
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg-page">
    <!-- Top Header -->
    <header class="shrink-0 border-b border-border-light bg-bg-surface">
      <div class="mx-auto max-w-7xl flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 flex items-center justify-center rounded-lg bg-primary text-white font-bold shadow-sm">
            <BookOpen :size="20" />
          </div>
          <div>
            <h1 class="text-xl text-text-primary font-bold tracking-tight">
              AI 小说创作工坊
            </h1>
            <p class="text-xs text-text-muted">
              管理项目、设定与长篇写作工作流
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative min-w-0 sm:w-72">
            <Search class="absolute left-3 top-1/2 text-text-muted -translate-y-1/2" :size="16" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索项目..."
              class="h-10 w-full border border-border-light rounded-md bg-bg-subtle pl-9 pr-3 text-sm transition-colors focus:border-primary focus:bg-bg-surface focus:outline-none"
            >
          </div>
          <NButton variant="primary" @click="openCreateModal">
            <Plus :size="18" class="mr-1" /> 创建新项目
          </NButton>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto p-8">
      <div v-if="loading" class="grid gap-6 lg:grid-cols-3 md:grid-cols-2 xl:grid-cols-4">
        <div v-for="i in 4" :key="i" class="h-48 animate-pulse border border-border-light rounded-xl bg-bg-surface" />
      </div>

      <NEmptyState
        v-else-if="filteredProjects.length === 0"
        title="暂无项目"
        description="立刻创建您的第一个创作项目，开启 AI 辅助写作之旅。"
        class="mt-20"
      >
        <template #action>
          <NButton variant="primary" @click="openCreateModal">
            创建第一个项目
          </NButton>
        </template>
      </NEmptyState>

      <div v-else class="mx-auto max-w-7xl space-y-6">
        <div class="grid gap-4 md:grid-cols-3">
          <div class="border border-border-light rounded-lg bg-bg-surface p-4 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              项目数
            </div>
            <div class="mt-1 text-2xl text-text-primary font-bold">
              {{ projectStore.projects.length }}
            </div>
          </div>
          <div class="border border-border-light rounded-lg bg-bg-surface p-4 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              目标总字数
            </div>
            <div class="mt-1 text-2xl text-text-primary font-bold">
              {{ totalTargetWords.toLocaleString() }}
            </div>
          </div>
          <div class="border border-border-light rounded-lg bg-bg-surface p-4 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              当前筛选
            </div>
            <div class="mt-1 text-2xl text-text-primary font-bold">
              {{ filteredProjects.length }}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <h2 class="text-sm text-text-muted font-semibold tracking-wider uppercase">
            最近创作项目
          </h2>
          <span class="text-xs text-text-muted">按最近更新排序</span>
        </div>

        <div class="grid gap-6 lg:grid-cols-3 md:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="project in filteredProjects"
            :key="project.id"
            class="group relative cursor-pointer border border-border-light rounded-xl bg-bg-surface p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5"
            @click="router.push(`/project/${project.id}`)"
          >
            <!-- Card Header -->
            <div class="mb-4 flex items-start justify-between">
              <NTag v-if="project.genre" size="sm" variant="info">
                {{ project.genre }}
              </NTag>
              <div v-else class="h-5" />

              <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  class="rounded p-1.5 text-text-muted transition-colors hover:bg-semantic-error/10 hover:text-semantic-error"
                  @click.stop="confirmDelete(project.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>

            <!-- Card Body -->
            <div>
              <h3 class="mb-2 text-lg text-text-primary font-bold leading-tight transition-colors group-hover:text-primary">
                {{ project.title }}
              </h3>
              <p class="line-clamp-2 mb-6 h-10 text-sm text-text-muted">
                {{ project.theme || '尚未设定项目主题。' }}
              </p>
            </div>

            <!-- Card Footer -->
            <div class="flex items-center justify-between border-t border-border-light pt-4">
              <div class="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock :size="12" />
                {{ formatDate(project.updatedAt) }}
              </div>
              <div class="flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                <BarChart3 :size="12" />
                {{ project.targetWords ? `${(project.targetWords / 1000).toFixed(0)}k` : '?' }} 字
              </div>
            </div>

            <!-- Quick Link Overlay bit -->
            <div class="absolute right-4 top-4 flex items-center gap-1 text-xs text-primary underline decoration-2 underline-offset-4 opacity-0 transition-all group-hover:opacity-100">
              打开项目 <ExternalLink :size="10" />
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Create Project Modal -->
    <NModal v-model="showCreateModal" title="创建新项目">
      <form class="space-y-4" @submit.prevent="handleCreate">
        <NInput v-model="form.title" label="项目名称" placeholder="输入您的小说标题" />
        <div class="grid grid-cols-2 gap-4">
          <NInput v-model="form.genre" label="小说题材" placeholder="如：奇幻、玄幻、科幻..." />
          <NInput v-model="form.targetWords" label="目标字数" type="number" placeholder="输入期望的总字数（如 80000）" />
        </div>
        <NInput v-model="form.theme" label="核心主题" placeholder="简述故事想要传达的核心灵魂" />
        <p v-if="createError" class="text-xs text-semantic-error">
          {{ createError }}
        </p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton variant="ghost" @click="showCreateModal = false">
            取消
          </NButton>
          <NButton variant="primary" @click="handleCreate">
            开始创作
          </NButton>
        </div>
      </template>
    </NModal>

    <NConfirmDialog
      v-model="showDeleteConfirm"
      title="删除创作项目"
      description="这将永久删除该项目及其所有关联数据（小说大纲、角色设定、已写章节等）。此操作无法撤销。是否确认？"
      confirm-text="确认删除"
      variant="danger"
      @confirm="handleConfirmDelete"
    />
  </div>
</template>
