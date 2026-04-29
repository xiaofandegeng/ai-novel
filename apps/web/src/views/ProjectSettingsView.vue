<script setup lang="ts">
import type { ProjectStatus, UpdateProjectInput } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NInput,
  NLoadingState,
  NPanel,
  NSelect,
  NTextArea,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  RotateCcw,
  Save,
  Settings,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as settingsApi from '../api/settings'
import AppSidebar from '../components/AppSidebar.vue'
import { useProjectStore } from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()
const projectStore = useProjectStore()

const loading = ref(true)
const saving = ref(false)
const savingAI = ref(false)
const testingAI = ref(false)
const titleError = ref('')

const form = ref({
  title: '',
  description: '',
  genre: '',
  theme: '',
  targetWords: '',
  targetAudience: '',
  styleProfile: '',
  status: 'planning' as ProjectStatus,
})

const aiForm = ref({
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  temperature: '70',
  hasApiKey: false,
})

const aiTestMessage = ref('')

const statusOptions = [
  { label: '规划中', value: 'planning' },
  { label: '写作中', value: 'writing' },
  { label: '暂停', value: 'paused' },
  { label: '已完成', value: 'completed' },
  { label: '已归档', value: 'archived' },
]

const projectStatusModel = computed<string | number>({
  get: () => form.value.status,
  set: (value) => {
    form.value.status = String(value) as ProjectStatus
  },
})

function syncFormFromProject() {
  const project = projectStore.currentProject
  if (!project)
    return

  form.value = {
    title: project.title,
    description: project.description || '',
    genre: project.genre || '',
    theme: project.theme || '',
    targetWords: project.targetWords ? String(project.targetWords) : '',
    targetAudience: project.targetAudience || '',
    styleProfile: project.styleProfile || '',
    status: project.status,
  }
}

onMounted(async () => {
  try {
    const [, aiSettings] = await Promise.all([
      projectStore.fetchProject(projectId),
      settingsApi.fetchAISettings(),
    ])
    syncFormFromProject()
    aiForm.value = {
      provider: aiSettings.provider,
      baseUrl: aiSettings.baseUrl,
      model: aiSettings.model,
      apiKey: '',
      temperature: String(aiSettings.temperature),
      hasApiKey: aiSettings.hasApiKey,
    }
  }
  catch {
    toast.add('项目设置加载失败', 'error')
    router.push('/')
  }
  finally {
    loading.value = false
  }
})

function buildPayload(): UpdateProjectInput | null {
  titleError.value = ''

  const title = form.value.title.trim()
  if (!title) {
    titleError.value = '项目名称不能为空'
    return null
  }

  const targetWords = Number(form.value.targetWords)

  return {
    title,
    description: form.value.description.trim() || undefined,
    genre: form.value.genre.trim() || undefined,
    theme: form.value.theme.trim() || undefined,
    targetWords: Number.isFinite(targetWords) && targetWords > 0 ? targetWords : undefined,
    targetAudience: form.value.targetAudience.trim() || undefined,
    styleProfile: form.value.styleProfile.trim() || undefined,
    status: form.value.status,
  }
}

async function handleSave() {
  const payload = buildPayload()
  if (!payload)
    return

  saving.value = true
  try {
    await projectStore.updateProject(projectId, payload)
    syncFormFromProject()
    toast.add('项目设置已保存', 'success')
  }
  catch {
    toast.add('项目设置保存失败', 'error')
  }
  finally {
    saving.value = false
  }
}

function handleReset() {
  syncFormFromProject()
  titleError.value = ''
  toast.add('已恢复为当前项目配置', 'info')
}

function buildAISettingsPayload() {
  return {
    provider: aiForm.value.provider.trim() || 'openai-compatible',
    baseUrl: aiForm.value.baseUrl.trim(),
    model: aiForm.value.model.trim(),
    apiKey: aiForm.value.apiKey.trim() || undefined,
    temperature: Number(aiForm.value.temperature),
  }
}

async function handleSaveAI() {
  savingAI.value = true
  aiTestMessage.value = ''
  try {
    const settings = await settingsApi.updateAISettings(buildAISettingsPayload())
    aiForm.value.apiKey = ''
    aiForm.value.hasApiKey = settings.hasApiKey
    aiForm.value.temperature = String(settings.temperature)
    toast.add('AI 配置已保存', 'success')
  }
  catch {
    toast.add('AI 配置保存失败', 'error')
  }
  finally {
    savingAI.value = false
  }
}

async function handleTestAI() {
  testingAI.value = true
  aiTestMessage.value = ''
  try {
    const result = await settingsApi.testAISettings(buildAISettingsPayload())
    aiTestMessage.value = result.latencyMs
      ? `${result.message}，耗时 ${result.latencyMs}ms`
      : result.message
    toast.add(result.ok ? 'AI 服务检测通过' : 'AI 服务检测未通过', result.ok ? 'success' : 'warning')
  }
  catch {
    aiTestMessage.value = 'AI 服务检测失败'
    toast.add('AI 服务检测失败', 'error')
  }
  finally {
    testingAI.value = false
  }
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '加载中…'" :project-id="projectId">
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
          {{ projectStore.currentProject?.title || '加载中…' }}
        </router-link>
      </div>
    </template>

    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-2">
        <NButton variant="ghost" size="sm" :disabled="loading || saving" @click="handleReset">
          <RotateCcw :size="16" class="mr-1.5" /> 重置
        </NButton>
        <NButton variant="primary" size="sm" :loading="saving" @click="handleSave">
          <Save :size="16" class="mr-1.5" /> 保存设置
        </NButton>
      </div>
    </template>

    <main class="min-h-full bg-bg-page p-6 lg:p-8">
      <div class="mx-auto max-w-5xl space-y-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="mb-2 flex items-center gap-2 text-sm text-primary font-semibold">
              <Settings :size="16" />
              项目设置
            </div>
            <h1 class="text-2xl text-text-primary font-bold">
              配置作品的全局创作参数
            </h1>
            <p class="mt-2 max-w-2xl text-sm text-text-secondary leading-relaxed">
              这些配置会影响仪表盘、导出信息、AI 辅助上下文和后续质量评估，是整部作品的基础档案。
            </p>
          </div>
        </div>

        <NLoadingState v-if="loading" />

        <template v-else>
          <NPanel title="基础信息" description="定义作品的名称、简介和基础分类。">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="md:col-span-2">
                <NInput
                  v-model="form.title"
                  label="项目名称"
                  placeholder="例如：镜中城回声"
                  :error="titleError"
                />
              </div>

              <NInput
                v-model="form.genre"
                label="作品类型"
                placeholder="例如：悬疑、奇幻、科幻"
              />

              <NInput
                v-model="form.theme"
                label="核心主题"
                placeholder="例如：记忆、身份与选择的代价"
              />

              <div class="md:col-span-2">
                <NTextArea
                  v-model="form.description"
                  label="项目简介"
                  placeholder="用几句话说明作品的核心设定、主角困境和故事承诺。"
                  :rows="4"
                />
              </div>
            </div>
          </NPanel>

          <NPanel title="写作目标" description="统一管理作品状态、目标字数和目标读者。">
            <div class="grid gap-4 md:grid-cols-3">
              <NSelect
                v-model="projectStatusModel"
                label="项目状态"
                :options="statusOptions"
              />

              <NInput
                v-model="form.targetWords"
                label="目标字数"
                type="number"
                placeholder="例如：200000"
              />

              <NInput
                v-model="form.targetAudience"
                label="目标读者"
                placeholder="例如：喜欢都市悬疑的成年读者"
              />
            </div>
          </NPanel>

          <NPanel title="风格配置" description="给 AI 和作者自己一个稳定的语言风格锚点。">
            <NTextArea
              v-model="form.styleProfile"
              label="写作风格说明"
              placeholder="例如：冷静克制、意象密集、节奏偏快；避免过度解释，保留悬疑留白。"
              :rows="6"
            />
          </NPanel>

          <NPanel title="AI 服务配置" description="配置 OpenAI 兼容接口，并检测当前模型是否可用。">
            <div class="grid gap-4 md:grid-cols-2">
              <NInput
                v-model="aiForm.provider"
                label="服务类型"
                placeholder="openai-compatible"
              />

              <NInput
                v-model="aiForm.model"
                label="模型名称"
                placeholder="例如：gpt-4o-mini / deepseek-chat"
              />

              <div class="md:col-span-2">
                <NInput
                  v-model="aiForm.baseUrl"
                  label="API Base URL"
                  placeholder="例如：https://api.openai.com/v1"
                />
              </div>

              <NInput
                v-model="aiForm.apiKey"
                label="API Key"
                type="password"
                :placeholder="aiForm.hasApiKey ? '已配置，留空则保持不变' : '请输入 API Key'"
              />

              <NInput
                v-model="aiForm.temperature"
                label="温度"
                type="number"
                placeholder="0-100"
              />
            </div>

            <template #footer>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-xs text-text-muted">
                  {{ aiForm.hasApiKey ? '当前已保存 API Key。为了安全，页面不会回显密钥。' : '当前尚未保存 API Key。' }}
                  <span v-if="aiTestMessage" class="ml-2 text-text-secondary">{{ aiTestMessage }}</span>
                </p>
                <div class="flex justify-end gap-2">
                  <NButton variant="secondary" :loading="testingAI" @click="handleTestAI">
                    检测可用性
                  </NButton>
                  <NButton variant="primary" :loading="savingAI" @click="handleSaveAI">
                    保存 AI 配置
                  </NButton>
                </div>
              </div>
            </template>
          </NPanel>

          <div class="flex justify-end gap-2">
            <NButton variant="ghost" :disabled="saving" @click="handleReset">
              重置
            </NButton>
            <NButton variant="primary" :loading="saving" @click="handleSave">
              保存设置
            </NButton>
          </div>
        </template>
      </div>
    </main>
  </NAppLayout>
</template>
