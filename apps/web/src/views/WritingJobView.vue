<script setup lang="ts">
import {
  NAppLayout,
  NLoadingState,
} from '@ai-novel/ui'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import WritingJobLauncher from '../features/writing-jobs/components/WritingJobLauncher.vue'
import WritingJobStepTimeline from '../features/writing-jobs/components/WritingJobStepTimeline.vue'
import { useWritingJobController } from '../features/writing-jobs/composables/useWritingJobController'

const route = useRoute()
const projectId = route.params.id as string

const {
  loading,
  creating,
  actionLoading,
  job,
  steps,
  form,
  formChapterId,
  formSceneId,
  projectStore,
  handleCreate,
  handleStart,
  handlePause,
  handleDelete,
  handleRetry,
} = useWritingJobController(projectId)
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
          自动写作
        </h1>
        <p class="text-sm text-text-muted">
          由 AI 自动驾驶引擎接管上下文构建、生成、检查、修复与写回。
        </p>
      </div>

      <NLoadingState v-if="loading" />
      <div v-else class="mx-auto max-w-2xl">
        <WritingJobLauncher
          v-if="!job"
          v-model="form"
          v-model:chapter-id="formChapterId"
          v-model:scene-id="formSceneId"
          :project-id="projectId"
          :creating="creating"
          @create="handleCreate"
        />

        <WritingJobStepTimeline
          v-else
          :job="job"
          :steps="steps"
          :action-loading="actionLoading"
          @start="handleStart"
          @pause="handlePause"
          @delete="handleDelete"
          @retry="handleRetry"
        />
      </div>
    </div>
  </NAppLayout>
</template>
