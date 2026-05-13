<script setup lang="ts">
import {
  NButton,
  NConfirmDialog,
  NEmptyState,
  NIconButton,
  NInput,
  NModal,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  BarChart3,
  BookOpen,
  Clock,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectLabels } from '../composables/useProjectLabels'
import { useProjectStore } from '../stores/project.store'

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
  return projectStore.projects.filter(p =>
    p.title.toLowerCase().includes(q)
    || (p.genre && p.genre.toLowerCase().includes(q)),
  )
})

const totalTargetWords = computed(() =>
  projectStore.projects.reduce((sum: number, project) => sum + (project.targetWords || 0), 0),
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
    toast.add('项目已创建', 'success')
    router.push(`/project/${p.id}`)
  }
  catch (e: any) {
    createError.value = e.message || '创建项目失败，请稍后重试'
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
    toast.add('项目已删除', 'success')
  }
  catch {
    toast.add('删除项目失败，请稍后重试', 'error')
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

const { projectStatusLabels } = useProjectLabels()

function statusLabel(status: string) {
  return projectStatusLabels[status] || '未设置'
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
          <div class="min-w-0 sm:w-72">
            <label class="sr-only" for="project-search">搜索项目</label>
            <div class="relative">
              <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 text-text-muted -translate-y-1/2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                id="project-search"
                v-model="searchQuery"
                type="text"
                placeholder="搜索项目..."
                class="h-10 w-full border border-border-light rounded-md bg-bg-subtle pl-9 pr-3 text-sm text-text-primary transition-colors focus:border-primary focus:bg-bg-surface placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
            </div>
          </div>
          <NButton variant="primary" @click="openCreateModal">
            <Plus :size="18" class="mr-1" /> 创建新项目
          </NButton>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto p-8">
      <div v-if="loading" class="grid gap-5 2xl:grid-cols-3 md:grid-cols-2">
        <div v-for="i in 4" :key="i" class="h-44 animate-pulse border border-border-light rounded-lg bg-bg-surface" />
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
          <div class="border border-border-light rounded-lg bg-bg-surface px-4 py-3 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              项目数
            </div>
            <div class="mt-1 text-xl text-text-primary font-bold">
              {{ projectStore.projects.length }}
            </div>
          </div>
          <div class="border border-border-light rounded-lg bg-bg-surface px-4 py-3 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              目标总字数
            </div>
            <div class="mt-1 text-xl text-text-primary font-bold">
              {{ totalTargetWords.toLocaleString() }}
            </div>
          </div>
          <div class="border border-border-light rounded-lg bg-bg-surface px-4 py-3 shadow-sm">
            <div class="text-xs text-text-muted font-semibold tracking-widest uppercase">
              当前筛选
            </div>
            <div class="mt-1 text-xl text-text-primary font-bold">
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

        <div class="grid gap-5 2xl:grid-cols-3 md:grid-cols-2">
          <article
            v-for="project in filteredProjects"
            :key="project.id"
            class="group relative border border-border-light rounded-lg bg-bg-surface p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <router-link
              :to="`/project/${project.id}`"
              class="block focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              <!-- Card Header -->
              <div class="mb-3 flex items-start justify-between">
                <div class="flex items-center gap-2">
                  <NTag v-if="project.genre" size="sm" variant="info">
                    {{ project.genre }}
                  </NTag>
                  <NTag size="sm" :variant="project.status === 'completed' ? 'success' : 'info'">
                    {{ statusLabel(project.status) }}
                  </NTag>
                </div>
              </div>

              <!-- Card Body -->
              <div>
                <h3 class="mb-2 text-lg text-text-primary font-bold leading-tight transition-colors group-hover:text-primary">
                  {{ project.title }}
                </h3>
                <p class="line-clamp-2 mb-4 h-10 text-sm text-text-muted">
                  {{ project.theme || '尚未设定项目主题。' }}
                </p>
              </div>

              <!-- Card Footer -->
              <div class="flex items-center justify-between border-t border-border-light pt-3">
                <div class="flex items-center gap-1.5 text-xs text-text-muted">
                  <Clock :size="12" />
                  {{ formatDate(project.updatedAt) }}
                </div>
                <div class="flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                  <BarChart3 :size="12" />
                  目标 {{ project.targetWords?.toLocaleString() || '未设定' }} 字
                </div>
              </div>
            </router-link>

            <NIconButton
              label="删除项目"
              variant="ghost"
              size="sm"
              class="absolute right-3 top-3 text-text-muted hover:text-semantic-error"
              @click.stop="confirmDelete(project.id)"
            >
              <Trash2 :size="14" />
            </NIconButton>
          </article>
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
