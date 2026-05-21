<script setup lang="ts">
import {
  NAppLayout,
  NLoadingState,
  NTag,
} from '@ai-novel/ui'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import WritingJobLauncher from '../features/writing-jobs/components/writing-job-launcher.vue'
import WritingJobStepTimeline from '../features/writing-jobs/components/writing-job-step-timeline.vue'
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_VARIANT,
  useWritingJobController,
} from '../features/writing-jobs/composables/useWritingJobController'

const route = useRoute()
const projectId = route.params.id as string

const {
  loading,
  creating,
  actionLoading,
  job,
  steps,
  canCreateNewJob,
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
      <div v-else class="mx-auto max-w-3xl space-y-6">
        <div
          v-if="job && canCreateNewJob"
          class="border border-border-light rounded-lg bg-bg-surface p-4"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 class="text-sm text-text-primary font-bold">
                可以开启新的自动写作任务
              </h2>
              <p class="mt-1 text-xs text-text-muted">
                上一轮任务{{ JOB_STATUS_LABEL[job.status] || '已结束' }}，会保留在下方作为历史记录，不需要删除也可以继续创建下一轮。
              </p>
            </div>
            <NTag :variant="JOB_STATUS_VARIANT[job.status] || 'default'">
              上一轮{{ JOB_STATUS_LABEL[job.status] || '已结束' }}
            </NTag>
          </div>
        </div>

        <WritingJobLauncher
          v-if="canCreateNewJob"
          v-model="form"
          v-model:chapter-id="formChapterId"
          v-model:scene-id="formSceneId"
          :project-id="projectId"
          :creating="creating"
          @create="handleCreate"
        />

        <div v-if="job && canCreateNewJob" class="pt-2">
          <h2 class="mb-3 text-sm text-text-muted font-semibold">
            最近一轮任务记录
          </h2>
          <WritingJobStepTimeline
            :job="job"
            :steps="steps"
            :action-loading="actionLoading"
            @start="handleStart"
            @pause="handlePause"
            @delete="handleDelete"
            @retry="handleRetry"
          />
        </div>

        <WritingJobStepTimeline
          v-else-if="job"
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
