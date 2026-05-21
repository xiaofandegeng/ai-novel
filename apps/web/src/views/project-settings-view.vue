<script setup lang="ts">
import type { NovelProject, ProjectPersonaConfig, WritingPersona } from '@ai-novel/shared'
import { NButton, NConfirmDialog, NInput, NPanel, NTag, useToast } from '@ai-novel/ui'

import {
  BookOpen,
  Bot,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import { onMounted, reactive, ref } from 'vue'

import { useRoute, useRouter } from 'vue-router'
import { exportProject, importProject } from '../api/data-portability'
import {
  getProjectPersonaConfig,
  listPublishedPersonas,
  updateProjectPersonaConfig,
} from '../api/persona'

import { deleteProject, fetchProject, updateProject } from '../api/projects'
import AIPromptSettings from '../features/settings/components/ai-prompt-settings.vue'
import ProjectAIProviderSettings from '../features/settings/components/project-ai-provider-settings.vue'
import ProjectExportPanel from '../features/settings/components/project-export-panel.vue'
import { useAIProviderSettings } from '../features/settings/composables/useAIProviderSettings'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const activeTab = ref<'general' | 'ai' | 'ai-provider'>('general')
const loading = ref(true)
const saving = ref(false)
const showDeleteConfirm = ref(false)
const project = ref<NovelProject | null>(null)
const personas = ref<WritingPersona[]>([])
const personaConfig = ref<ProjectPersonaConfig | null>(null)

const form = reactive({
  title: '',
  description: '',
  genre: '',
  theme: '',
  targetWords: 300000,
})

const personaForm = reactive({
  personaId: '',
  strength: 50,
  enabledForOutline: true,
  enabledForDraft: true,
  enabledForPolish: true,
  enabledForQualityReview: true,
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
    const [p, ps, config] = await Promise.all([
      fetchProject(projectId),
      listPublishedPersonas(),
      getProjectPersonaConfig(projectId),
    ])

    project.value = p
    Object.assign(form, {
      title: p.title,
      description: p.description || '',
      genre: p.genre || '',
      theme: p.theme || '',
      targetWords: p.targetWords || 300000,
    })

    personas.value = ps
    personaConfig.value = config
    if (config) {
      Object.assign(personaForm, {
        personaId: config.personaId,
        strength: config.strength,
        enabledForOutline: config.enabledForOutline,
        enabledForDraft: config.enabledForDraft,
        enabledForPolish: config.enabledForPolish,
        enabledForQualityReview: config.enabledForQualityReview,
      })
    }
  }
  catch (e: any) {
    toast.add(`数据加载失败: ${e.message}`, 'error')
  }
  finally {
    loading.value = false
  }
}

async function handleSaveProject() {
  saving.value = true
  try {
    await updateProject(projectId, form)
    // Also update persona config
    await updateProjectPersonaConfig(projectId, personaForm)
    toast.add('设置已保存', 'success')
  }
  catch (e: any) {
    toast.add(`保存失败: ${e.message}`, 'error')
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
  catch (e: any) {
    toast.add(`删除失败: ${e.message}`, 'error')
  }
}

async function handleExport() {
  try {
    const data = await exportProject(projectId)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `plotpilot-project-${project.value?.title || projectId}-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.add('项目导出成功', 'success')
  }
  catch (e: any) {
    toast.add(`导出失败: ${e.message}`, 'error')
  }
}

const fileInput = ref<HTMLInputElement | null>(null)

function triggerImport() {
  fileInput.value?.click()
}

async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file)
    return

  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const result = await importProject(data)
    toast.add(`项目导入成功！新项目 ID: ${result.projectId}`, 'success')
    router.push(`/project/${result.projectId}/settings`)
  }
  catch (e: any) {
    toast.add(`导入失败: ${e.message}`, 'error')
  }
  finally {
    target.value = ''
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto bg-bg-page p-8">
    <header class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl text-text-primary font-bold">
          <Settings class="text-primary" :size="24" />
          项目设置
        </h1>
        <p class="mt-1 text-sm text-text-muted">
          管理作品全局信息、AI 写作人格及项目生命周期。
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
    <div class="bg-bg-card mb-8 w-fit flex gap-1 border border-border-light rounded-xl p-1 shadow-sm">
      <button
        class="rounded-lg px-6 py-2 text-sm font-medium transition-all"
        :class="activeTab === 'general' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-bg-page'"
        @click="activeTab = 'general'"
      >
        常规设置
      </button>
      <button
        class="rounded-lg px-6 py-2 text-sm font-medium transition-all"
        :class="activeTab === 'ai' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-bg-page'"
        @click="activeTab = 'ai'"
      >
        AI 提示词与结构
      </button>
      <button
        class="rounded-lg px-6 py-2 text-sm font-medium transition-all"
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

    <div v-if="!loading" class="mx-auto max-w-4xl w-full">
      <div v-if="activeTab === 'general'" class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
        <!-- Basic Info Section -->
        <section class="space-y-4">
          <h2 class="flex items-center gap-2 px-1 text-lg text-text-primary font-bold">
            <BookOpen class="text-primary" :size="18" />
            基础信息
          </h2>
          <NPanel class="p-6 space-y-6">
            <div class="grid grid-cols-2 gap-6">
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

        <!-- AI Persona Section -->
        <section class="space-y-4">
          <div class="flex items-center justify-between px-1">
            <h2 class="flex items-center gap-2 text-lg text-text-primary font-bold">
              <Sparkles class="text-primary" :size="18" />
              AI 写作人格绑定
            </h2>
            <NTag variant="ai">
              BETA
            </NTag>
          </div>

          <NPanel class="relative overflow-hidden p-6 space-y-8">
            <div class="absolute rotate-12 opacity-5 -right-20 -top-20">
              <Bot :size="240" />
            </div>

            <div class="relative z-10 space-y-6">
              <div class="space-y-3">
                <label class="text-xs text-text-muted font-bold uppercase">选择参考人格</label>
                <select
                  v-model="personaForm.personaId"
                  class="w-full appearance-none border border-border-light rounded-lg bg-bg-page p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">
                    不使用参考人格（默认风格）
                  </option>
                  <option v-for="p in personas" :key="p.id" :value="p.id">
                    {{ p.name }} - {{ p.coreAppeal || '无爽点定义' }}
                  </option>
                </select>
                <p class="text-xs text-text-muted">
                  人格通过分析参考作品提取。绑定后，AI 写作将遵循其节奏、冲突模型和爽点规则。
                </p>
              </div>

              <div v-if="personaForm.personaId" class="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <label class="flex items-center gap-1 text-xs text-text-muted font-bold uppercase">
                      人格模拟强度
                      <HelpCircle class="text-text-muted" :size="12" title="强度越高，AI 越倾向于使用该人格的叙事模板，但相似度风险也会增加。" />
                    </label>
                    <NTag :variant="personaForm.strength > 70 ? 'error' : 'primary'" size="sm">
                      {{ personaForm.strength }}% ({{ personaForm.strength > 75 ? '深度模拟' : personaForm.strength > 40 ? '平衡模式' : '弱参考' }})
                    </NTag>
                  </div>
                  <input
                    v-model.number="personaForm.strength"
                    class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-primary"
                    max="100"
                    min="0"
                    type="range"
                  >
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div
                    v-for="scene in [
                      { key: 'enabledForOutline', label: '应用于大纲生成' },
                      { key: 'enabledForDraft', label: '应用于正文写作' },
                      { key: 'enabledForPolish', label: '应用于润色优化' },
                      { key: 'enabledForQualityReview', label: '应用于质量评估' },
                    ]"
                    :key="scene.key"
                    class="flex items-center justify-between border border-border-light rounded-lg bg-bg-page/50 p-3"
                  >
                    <span class="text-xs text-text-secondary font-medium">{{ scene.label }}</span>
                    <button
                      class="relative h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none"
                      :class="(personaForm as any)[scene.key] ? 'bg-primary' : 'bg-gray-300'"
                      @click="(personaForm as any)[scene.key] = !(personaForm as any)[scene.key]"
                    >
                      <span
                        class="absolute left-0.5 top-0.5 h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
                        :class="(personaForm as any)[scene.key] ? 'translate-x-4' : 'translate-x-0'"
                      />
                    </button>
                  </div>
                </div>

                <div class="flex gap-3 border border-primary/10 rounded-xl bg-primary-soft/20 p-4">
                  <ShieldCheck class="shrink-0 text-primary" :size="20" />
                  <div>
                    <h4 class="text-xs text-primary font-bold">
                      相似度防护已开启
                    </h4>
                    <p class="mt-1 text-[11px] text-text-secondary">
                      系统将自动注入“禁止复刻原文”、“禁止使用专名”等约束，确保创作原创性。
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="border-2 border-border-light rounded-xl border-dashed py-8 text-center">
                <p class="text-sm text-text-muted italic">
                  前往“人格书库”上传参考作品并生成你的人格。
                </p>
                <NButton class="mt-4" size="sm" @click="router.push('/persona')">
                  前往人格书库 <ChevronRight class="ml-1" :size="14" />
                </NButton>
              </div>
            </div>
          </NPanel>
          <!-- Data Portability Section -->
          <section class="space-y-4">
            <h2 class="flex items-center gap-2 px-1 text-lg text-text-primary font-bold">
              <Download class="text-primary" :size="18" />
              数据备份与迁移
            </h2>
            <NPanel class="p-6">
              <div class="grid grid-cols-2 gap-8">
                <div class="space-y-3">
                  <h3 class="text-sm text-text-primary font-bold">
                    导出项目备份
                  </h3>
                  <p class="text-xs text-text-muted leading-relaxed">
                    导出当前项目的完整数据（包括大纲、正文、设定、知识库及 AI 上下文快照）。备份文件可用于在其他环境导入或作为历史留档。
                  </p>
                  <NButton class="w-full" variant="secondary" @click="handleExport">
                    <Download class="mr-2" :size="16" />
                    导出完整备份 (.json)
                  </NButton>
                </div>

                <div class="space-y-3">
                  <h3 class="text-sm text-text-primary font-bold">
                    导入项目数据
                  </h3>
                  <p class="text-xs text-text-muted leading-relaxed">
                    上传通过本系统导出的备份文件。导入将创建一个全新的项目，不会覆盖当前项目。请确保备份文件格式正确。
                  </p>
                  <input
                    ref="fileInput"
                    type="file"
                    accept=".json"
                    class="hidden"
                    @change="handleImport"
                  >
                  <NButton class="w-full" variant="secondary" @click="triggerImport">
                    <Upload class="mr-2" :size="16" />
                    上传并导入新项目
                  </NButton>
                </div>
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

    <div v-else class="flex flex-1 flex-col items-center justify-center">
      <RefreshCw class="animate-spin text-primary/30" :size="48" />
      <p class="mt-4 text-text-muted">
        载入项目配置...
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.animate-spin {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
  background-position: right 0.75rem center;
  background-repeat: no-repeat;
  background-size: 1rem;
}
</style>
