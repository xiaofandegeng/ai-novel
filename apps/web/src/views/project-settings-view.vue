<script setup lang="ts">
import type { NovelProject } from '@ai-novel/shared'
import { NButton, NConfirmDialog, NInput, NPanel, useToast } from '@ai-novel/ui'

import {
  BookOpen,
  Download,
  FileText,
  HelpCircle,
  Save,
  Settings,
  Trash2,
} from 'lucide-vue-next'
import { onMounted, reactive, ref } from 'vue'

import { useRoute, useRouter } from 'vue-router'
import { deleteProject, fetchProject, updateProject } from '@/features/projects/api/projects.api'
import { exportProject } from '@/features/settings/api/export.api'

import AIPromptSettings from '../features/settings/components/ai-prompt-settings.vue'
import ProjectAIProviderSettings from '../features/settings/components/project-ai-provider-settings.vue'
import ProjectExportPanel from '../features/settings/components/project-export-panel.vue'
import { useAIProviderSettings } from '../features/settings/composables/useAIProviderSettings'
import { toErrorMessage } from '../shared/utils/error-message'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const activeTab = ref<'general' | 'ai' | 'ai-provider'>('general')
const loading = ref(true)
const saving = ref(false)
const showDeleteConfirm = ref(false)
const project = ref<NovelProject | null>(null)

const form = reactive({
  title: '',
  description: '',
  genre: '',
  theme: '',
  targetWords: 300000,
})

const {
  aiForm,
  saving: aiSaving,
  testing: aiTesting,
  embeddingTesting,
  aiTestMessage,
  embeddingTestMessage,
  aiProviderOptions,
  currentAIProviderPreset,
  currentEmbeddingProviderPreset,
  aiModelOptions,
  embeddingModelOptions,
  aiProviderModel,
  embeddingProviderModel,
  aiModelSelectModel,
  embeddingModelSelectModel,
  handleSaveAI,
  handleTestAI,
  handleTestEmbedding,
} = useAIProviderSettings(projectId)

async function loadData() {
  loading.value = true
  try {
    const p = await fetchProject(projectId)
    project.value = p
    Object.assign(form, {
      title: p.title,
      description: p.description || '',
      genre: p.genre || '',
      theme: p.theme || '',
      targetWords: p.targetWords || 300000,
    })
  }
  catch (error: unknown) {
    toast.add(`数据加载失败: ${toErrorMessage(error)}`, 'error')
  }
  finally {
    loading.value = false
  }
}

async function handleSaveProject() {
  saving.value = true
  try {
    await updateProject(projectId, form)
    toast.add('设置已保存', 'success')
  }
  catch (error: unknown) {
    toast.add(`保存失败: ${toErrorMessage(error)}`, 'error')
  }
  finally {
    saving.value = false
  }
}

async function handleDelete() {
  try {
    await deleteProject(projectId)
    router.push('/')
  }
  catch (error: unknown) {
    toast.add(`删除失败: ${toErrorMessage(error)}`, 'error')
  }
}

async function handleExport() {
  try {
    await exportProject(projectId)
    toast.add('项目导出成功', 'success')
  }
  catch (error: unknown) {
    toast.add(`导出失败: ${toErrorMessage(error)}`, 'error')
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto bg-bg-page p-4 lg:p-8 sm:p-6">
    <header class="mb-6 flex shrink-0 flex-col items-start gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl text-text-primary font-bold">
          <Settings class="text-primary" :size="24" />
          项目设置
        </h1>
        <p class="mt-1 text-sm text-text-muted">
          管理作品全局信息、AI 配置及项目生命周期。
        </p>
      </div>
      <div class="flex gap-3">
        <NButton v-if="activeTab === 'general'" class="text-red-500 hover:bg-red-50" variant="ghost" @click="showDeleteConfirm = true">
          <Trash2 class="mr-2" :size="16" />
          删除项目
        </NButton>
        <NButton v-if="activeTab === 'general'" :loading="saving" variant="primary" @click="handleSaveProject">
          <Save class="mr-2" :size="16" />
          保存更改
        </NButton>
      </div>
    </header>

    <!-- Settings Tabs -->
    <div class="bg-bg-card mb-6 max-w-full w-fit flex shrink-0 gap-1 overflow-x-auto border border-border-light rounded-xl p-1 shadow-sm sm:mb-8">
      <button
        class="shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-6"
        :class="activeTab === 'general' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-bg-page'"
        @click="activeTab = 'general'"
      >
        常规设置
      </button>
      <button
        class="shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-6"
        :class="activeTab === 'ai' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-bg-page'"
        @click="activeTab = 'ai'"
      >
        AI 提示词与结构
      </button>
      <button
        class="shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-6"
        :class="activeTab === 'ai-provider' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-bg-page'"
        @click="activeTab = 'ai-provider'"
      >
        AI 模型服务
      </button>
    </div>

    <NConfirmDialog
      v-model="showDeleteConfirm"
      cancel-text="取消"
      confirm-text="确认删除"
      description="所有数据（包括大纲、正文、设定）都将永久丢失，且无法恢复。"
      title="确定要删除此项目吗？"
      variant="danger"
      @confirm="handleDelete"
    />

    <div v-if="!loading" class="mx-auto max-w-4xl w-full shrink-0">
      <div v-if="activeTab === 'general'" class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
        <!-- Basic Info Section -->
        <section class="space-y-4">
          <h2 class="flex items-center gap-2 px-1 text-lg text-text-primary font-bold">
            <BookOpen class="text-primary" :size="18" />
            基础信息
          </h2>
          <NPanel class="p-4 space-y-6 sm:p-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div class="space-y-2">
                <NInput v-model="form.title" label="作品名称" placeholder="输入作品名称" />
              </div>
              <div class="space-y-2">
                <NInput v-model="form.genre" label="题材类型" placeholder="例如：玄幻、都市、悬疑" />
              </div>
            </div>

            <div class="space-y-2">
              <NInput v-model="form.theme" label="核心主题" placeholder="一句话概括作品核心表达" />
            </div>

            <div class="space-y-2">
              <label class="text-xs text-text-muted font-bold uppercase">作品简介</label>
              <textarea
                v-model="form.description"
                class="w-full border border-border-light rounded-lg bg-bg-page p-3 text-sm text-text-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="详细描述故事背景和主线任务..."
                rows="4"
              />
            </div>

            <div class="space-y-2">
              <label class="flex items-center gap-1 text-xs text-text-muted font-bold uppercase">
                目标总字数
                <HelpCircle class="text-text-muted" :size="12" />
              </label>
              <div class="flex items-center gap-4">
                <input
                  v-model.number="form.targetWords"
                  class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-primary"
                  max="2000000"
                  min="50000"
                  step="10000"
                  type="range"
                >
                <span class="w-24 text-right text-sm text-primary font-mono">{{ (form.targetWords / 10000).toFixed(0) }} 万字</span>
              </div>
            </div>
          </NPanel>
        </section>

        <!-- Data Export Section -->
        <section class="space-y-4">
          <h2 class="flex items-center gap-2 px-1 text-lg text-text-primary font-bold">
            <Download class="text-primary" :size="18" />
            数据备份
          </h2>
          <NPanel class="p-4 sm:p-6">
            <div class="space-y-3">
              <p class="text-xs text-text-muted leading-relaxed">
                导出当前项目的完整数据（包括大纲、正文、设定）。备份文件可用于历史留档。
              </p>
              <NButton variant="secondary" @click="handleExport">
                <Download class="mr-2" :size="16" />
                导出完整备份 (.json)
              </NButton>
            </div>
          </NPanel>
        </section>

        <!-- Manuscript Export Section -->
        <section class="space-y-4">
          <h2 class="flex items-center gap-2 px-1 text-lg text-text-primary font-bold">
            <FileText class="text-primary" :size="18" />
            手稿导出
          </h2>
          <ProjectExportPanel
            :project-id="projectId"
            :project-title="project?.title || ''"
          />
        </section>
      </div>

      <div v-else-if="activeTab === 'ai'" class="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-4xl w-full duration-500">
        <AIPromptSettings :project-id="projectId" />
      </div>

      <div v-else-if="activeTab === 'ai-provider'" class="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-4xl w-full duration-500">
        <ProjectAIProviderSettings
          v-model="aiForm"
          v-model:ai-provider-model="aiProviderModel"
          v-model:embedding-provider-model="embeddingProviderModel"
          v-model:ai-model-select-model="aiModelSelectModel"
          v-model:embedding-model-select-model="embeddingModelSelectModel"
          :saving="aiSaving"
          :testing="aiTesting"
          :embedding-testing="embeddingTesting"
          :ai-test-message="aiTestMessage"
          :embedding-test-message="embeddingTestMessage"
          :ai-provider-options="aiProviderOptions"
          :current-a-i-provider-preset="currentAIProviderPreset"
          :current-embedding-provider-preset="currentEmbeddingProviderPreset"
          :ai-model-options="aiModelOptions"
          :embedding-model-options="embeddingModelOptions"
          @save="handleSaveAI"
          @test="handleTestAI"
          @test-embedding="handleTestEmbedding"
        />
      </div>
    </div>
  </div>
</template>
