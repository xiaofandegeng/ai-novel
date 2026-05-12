<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NLoadingState,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  RotateCcw,
  Save,
  Settings,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import ProjectAIProviderSettings from '../features/settings/components/ProjectAIProviderSettings.vue'
import ProjectBasicSettingsForm from '../features/settings/components/ProjectBasicSettingsForm.vue'
import ProjectPersonaMemoryPanel from '../features/settings/components/ProjectPersonaMemoryPanel.vue'
import ProjectPersonaSettings from '../features/settings/components/ProjectPersonaSettings.vue'
import { useAIProviderSettings } from '../features/settings/composables/useAIProviderSettings'
import { useProjectBasicSettings } from '../features/settings/composables/useProjectBasicSettings'
import { useProjectPersonaSettings } from '../features/settings/composables/useProjectPersonaSettings'

const route = useRoute()
const projectId = route.params.id as string

const {
  loading: basicLoading,
  saving,
  titleError,
  form,
  statusOptions,
  projectStatusModel,
  projectStore,
  handleSave,
  handleReset,
} = useProjectBasicSettings(projectId)

const {
  loading: aiLoading,
  aiForm,
  saving: savingAI,
  testing: testingAI,
  aiTestMessage,
  aiProviderOptions,
  currentAIProviderPreset,
  aiModelOptions,
  aiProviderModel,
  aiModelSelectModel,
  handleSaveAI,
  handleTestAI,
} = useAIProviderSettings(projectId)

const {
  loading: personaLoading,
  publishedPersonas,
  personaForm,
  saving: savingPersona,
  preview: personaPreview,
  loadingPreview,
  personaOptions,
  handleSave: handleSavePersona,
  handlePreview: handlePreviewPersona,
} = useProjectPersonaSettings(projectId)

const settingsLoading = computed(() =>
  basicLoading.value || aiLoading.value || personaLoading.value,
)
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
        <NButton variant="ghost" size="sm" :disabled="basicLoading || saving" @click="handleReset">
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

        <NLoadingState v-if="settingsLoading" />

        <template v-else>
          <ProjectBasicSettingsForm
            v-model="form"
            :title-error="titleError"
            :status-options="statusOptions"
            :project-status-model="projectStatusModel"
            @update:project-status-model="projectStatusModel = $event"
          />

          <ProjectPersonaSettings
            v-model="personaForm"
            :published-personas="publishedPersonas"
            :persona-options="personaOptions"
            :saving="savingPersona"
            :loading-preview="loadingPreview"
            :preview="personaPreview"
            @save="handleSavePersona"
            @preview="handlePreviewPersona"
          />

          <ProjectPersonaMemoryPanel :project-id="projectId" />

          <ProjectAIProviderSettings
            v-model="aiForm"
            :saving="savingAI"
            :testing="testingAI"
            :ai-test-message="aiTestMessage"
            :ai-provider-options="aiProviderOptions"
            :current-ai-provider-preset="currentAIProviderPreset"
            :ai-model-options="aiModelOptions"
            :ai-provider-model="aiProviderModel"
            :ai-model-select-model="aiModelSelectModel"
            @update:ai-provider-model="aiProviderModel = $event"
            @update:ai-model-select-model="aiModelSelectModel = $event"
            @save="handleSaveAI"
            @test="handleTestAI"
          />

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
