<script setup lang="ts">
import type { StoryStructureTemplate } from '@ai-novel/shared'
import type { PromptOverride, PromptTemplate } from '../../../api/prompt-templates'
import { NButton, NConfirmDialog, NPanel, NTag, useToast } from '@ai-novel/ui'
import { Code, Layout, RefreshCw, Save, Terminal } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { promptTemplateApi } from '../../../api/prompt-templates'
import { storyStructureApi } from '../../../api/story-structure'

const props = defineProps<{
  projectId: string
}>()

const toast = useToast()
const loading = ref(true)
const templates = ref<PromptTemplate[]>([])
const overrides = ref<PromptOverride[]>([])
const structures = ref<StoryStructureTemplate[]>([])
const selectedTemplateKey = ref('')
const activeTab = ref<'prompts' | 'structure'>('prompts')

// Structure state
const applyingStructure = ref(false)
const pendingStructureTemplateId = ref<string | null>(null)
const showApplyStructureConfirm = ref(false)

async function loadData() {
  loading.value = true
  try {
    const [t, o, s] = await Promise.all([
      promptTemplateApi.listTemplates(),
      promptTemplateApi.getOverrides(props.projectId),
      storyStructureApi.listTemplates(),
    ])
    templates.value = t
    overrides.value = o
    structures.value = s
    if (t.length > 0) {
      selectedTemplateKey.value = t[0].key
    }
  }
  catch (e: any) {
    toast.add(`加载失败: ${e.message}`, 'error')
  }
  finally {
    loading.value = false
  }
}

function getOverride(key: string) {
  return overrides.value.find(o => o.templateKey === key)
}

const currentOverride = ref({
  system: '',
  user: '',
  enabled: true,
})

function selectTemplate(key: string) {
  selectedTemplateKey.value = key
  const override = getOverride(key)
  currentOverride.value = {
    system: override?.overrideSystemPrompt || '',
    user: override?.overrideUserPromptTemplate || '',
    enabled: override ? override.enabled === 1 : false,
  }
}

async function handleSaveOverride() {
  try {
    await promptTemplateApi.saveOverride(props.projectId, {
      templateKey: selectedTemplateKey.value,
      overrideSystemPrompt: currentOverride.value.system || null,
      overrideUserPromptTemplate: currentOverride.value.user || null,
      enabled: currentOverride.value.enabled ? 1 : 0,
    })
    toast.add('提示词覆盖已保存', 'success')
    // Refresh overrides
    const o = await promptTemplateApi.getOverrides(props.projectId)
    overrides.value = o
  }
  catch (e: any) {
    toast.add(`保存失败: ${e.message}`, 'error')
  }
}

function requestApplyStructure(templateId: string) {
  pendingStructureTemplateId.value = templateId
  showApplyStructureConfirm.value = true
}

async function handleApplyStructure() {
  if (!pendingStructureTemplateId.value)
    return
  applyingStructure.value = true
  try {
    await storyStructureApi.applyTemplate(props.projectId, pendingStructureTemplateId.value)
    toast.add('结构模板已应用，请前往“大纲”查看', 'success')
    showApplyStructureConfirm.value = false
    pendingStructureTemplateId.value = null
  }
  catch (e: any) {
    toast.add(`应用失败: ${e.message}`, 'error')
  }
  finally {
    applyingStructure.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <div class="flex border-b border-border-light">
      <button
        class="border-b-2 px-6 py-3 text-sm font-medium transition-colors"
        :class="activeTab === 'prompts' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary'"
        @click="activeTab = 'prompts'"
      >
        AI 提示词管理
      </button>
      <button
        class="border-b-2 px-6 py-3 text-sm font-medium transition-colors"
        :class="activeTab === 'structure' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary'"
        @click="activeTab = 'structure'"
      >
        故事结构模板
      </button>
    </div>

    <div v-if="loading" class="py-12 text-center">
      <RefreshCw class="mx-auto animate-spin text-primary/30" :size="32" />
      <p class="mt-2 text-sm text-text-muted">
        加载配置中...
      </p>
    </div>

    <div v-else-if="activeTab === 'prompts'" class="grid grid-cols-12 gap-6">
      <!-- Template List -->
      <div class="col-span-4 space-y-2">
        <div
          v-for="t in templates"
          :key="t.id"
          class="cursor-pointer border rounded-xl p-4 transition-all hover:shadow-sm"
          :class="selectedTemplateKey === t.key ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border-light bg-bg-card'"
          @click="selectTemplate(t.key)"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold" :class="selectedTemplateKey === t.key ? 'text-primary' : 'text-text-primary'">{{ t.name }}</span>
            <NTag v-if="getOverride(t.key)?.enabled" size="sm" variant="ai">
              已覆盖
            </NTag>
          </div>
          <p class="line-clamp-1 mt-1 text-xs text-text-muted">
            {{ t.description }}
          </p>
        </div>
      </div>

      <!-- Editor -->
      <div class="col-span-8 space-y-4">
        <NPanel v-if="selectedTemplateKey" class="p-6 space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-text-primary font-bold">
              <Terminal :size="18" class="text-primary" />
              {{ templates.find(t => t.key === selectedTemplateKey)?.name }} - 提示词覆盖
            </h3>
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-muted">启用覆盖</span>
              <button
                class="relative h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none"
                :class="currentOverride.enabled ? 'bg-primary' : 'bg-gray-300'"
                @click="currentOverride.enabled = !currentOverride.enabled"
              >
                <span
                  class="absolute left-0.5 top-0.5 h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
                  :class="currentOverride.enabled ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>

          <div class="space-y-4">
            <div class="space-y-2">
              <label class="flex items-center gap-1 text-xs text-text-muted font-bold uppercase">
                System Prompt
                <NTag size="sm" class="font-normal opacity-70">系统预设</NTag>
              </label>
              <textarea
                v-model="currentOverride.system"
                class="min-h-[120px] w-full border border-border-light rounded-lg bg-bg-page p-3 text-sm text-text-primary font-mono outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="留空则使用默认预设..."
              />
            </div>

            <div class="space-y-2">
              <label class="flex items-center gap-1 text-xs text-text-muted font-bold uppercase">
                User Prompt Template
                <NTag size="sm" class="font-normal opacity-70">用户指令模板</NTag>
              </label>
              <textarea
                v-model="currentOverride.user"
                class="min-h-[200px] w-full border border-border-light rounded-lg bg-bg-page p-3 text-sm text-text-primary font-mono outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="使用 {{variable}} 语法作为占位符..."
              />
              <p v-pre class="text-[10px] text-text-muted italic">
                提示：可以使用变量如 {{chapterTitle}}, {{outline}}, {{context}} 等（取决于具体任务）。
              </p>
            </div>
          </div>

          <div class="flex justify-end border-t border-border-light pt-4">
            <NButton variant="primary" size="sm" @click="handleSaveOverride">
              <Save :size="16" class="mr-2" />
              保存当前覆盖
            </NButton>
          </div>
        </NPanel>

        <div v-else class="bg-bg-card/30 h-64 flex flex-col items-center justify-center border-2 border-border-light rounded-xl border-dashed">
          <Code :size="48" class="text-text-muted/30" />
          <p class="mt-4 text-sm text-text-muted">
            从左侧选择一个提示词模板进行覆盖
          </p>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'structure'" class="space-y-6">
      <div class="grid grid-cols-2 gap-6">
        <NPanel
          v-for="s in structures"
          :key="s.id"
          class="group relative overflow-hidden p-6 transition-all hover:border-primary/50"
        >
          <div class="absolute opacity-5 transition-opacity -right-4 -top-4 group-hover:opacity-10">
            <Layout :size="120" />
          </div>

          <div class="relative z-10">
            <div class="flex items-center justify-between">
              <h3 class="text-lg text-text-primary font-bold">
                {{ s.name }}
              </h3>
              <NTag variant="primary">
                {{ s.genre }}
              </NTag>
            </div>
            <p class="mt-2 text-sm text-text-secondary leading-relaxed">
              {{ s.description }}
            </p>

            <div class="mt-6 space-y-3">
              <h4 class="text-xs text-text-muted font-bold uppercase">
                包含幕 (Acts)
              </h4>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="(act, idx) in (typeof s.actsJson === 'string' ? JSON.parse(s.actsJson) : s.actsJson)"
                  :key="idx"
                  class="border border-border-light rounded bg-bg-page px-2 py-1 text-[11px] text-text-secondary"
                >
                  {{ typeof act === 'string' ? act : act.title }}
                </span>
              </div>
            </div>

            <div class="mt-8 flex justify-end">
              <NButton
                size="sm"
                variant="secondary"
                :loading="applyingStructure"
                @click="requestApplyStructure(s.id)"
              >
                应用此结构模板
              </NButton>
            </div>
          </div>
        </NPanel>
      </div>
    </div>

    <NConfirmDialog
      v-model="showApplyStructureConfirm"
      title="应用故事结构模板"
      description="应用新结构将创建新的卷和幕，现有结构会被保留，但可能让当前大纲出现重复结构。系统会按自动化流程继续处理，是否继续？"
      confirm-text="继续应用"
      cancel-text="取消"
      :loading="applyingStructure"
      @confirm="handleApplyStructure"
    />
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
</style>
