<script setup lang="ts">
import type { WritingJobMode } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  Bot,
  CheckCircle2,
  Pause,
  Play,
  Trash2,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useProjectStore, useWritingJobStore } from '../stores/projects'

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const writingJobStore = useWritingJobStore()

const loading = ref(true)
const creating = ref(false)

const job = computed(() => writingJobStore.job)

const statusLabel: Record<string, string> = {
  idle: '就绪',
  running: '运行中',
  waiting_review: '等待审查',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}
const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  idle: 'default',
  running: 'info',
  waiting_review: 'warning',
  paused: 'default',
  completed: 'success',
  failed: 'error',
}

const modeLabel: Record<WritingJobMode, string> = {
  outline_only: '仅大纲',
  draft_only: '仅正文',
  outline_then_draft: '大纲+正文',
}

const form = ref<WritingJobMode>('outline_then_draft')

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      writingJobStore.fetchJob(projectId),
    ])
  }
  catch {
    toast.add('加载写作任务失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function handleCreate() {
  creating.value = true
  try {
    await writingJobStore.createJob(projectId, { mode: form.value })
    toast.add('写作任务已创建', 'success')
  }
  catch {
    toast.add('创建失败', 'error')
  }
  finally {
    creating.value = false
  }
}

async function handleStart() {
  try {
    await writingJobStore.startJob(projectId)
    toast.add('任务已启动', 'success')
  }
  catch (e: any) {
    toast.add(e.message || '启动失败', 'error')
  }
}

async function handlePause() {
  try {
    await writingJobStore.pauseJob(projectId)
    toast.add('任务已暂停', 'success')
  }
  catch (e: any) {
    toast.add(e.message || '暂停失败', 'error')
  }
}

async function handleContinue() {
  try {
    await writingJobStore.continueJob(projectId)
    toast.add('任务继续执行', 'success')
  }
  catch (e: any) {
    toast.add(e.message || '继续失败', 'error')
  }
}

async function handleDelete() {
  try {
    await writingJobStore.deleteJob(projectId)
    toast.add('任务已删除', 'success')
  }
  catch (e: any) {
    toast.add(e.message || '删除失败', 'error')
  }
}
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
          半自动写作
        </h1>
        <p class="text-sm text-text-muted">
          系统生成、作者确认的可控长篇写作流程
        </p>
      </div>

      <NLoadingState v-if="loading" />
      <div v-else class="mx-auto max-w-2xl">
        <!-- No job: create form -->
        <div v-if="!job" class="border border-border-light rounded-lg bg-bg-surface p-6 space-y-4">
          <div class="mb-2 flex items-center gap-3">
            <Bot :size="20" class="text-primary" />
            <h3 class="text-sm text-text-primary font-bold">
              创建写作任务
            </h3>
          </div>

          <div>
            <label class="mb-2 block text-xs text-text-muted">写作模式</label>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="(label, mode) in modeLabel"
                :key="mode"
                class="border rounded-lg p-3 text-center text-sm transition-colors"
                :class="form === mode ? 'border-primary bg-primary-soft text-primary' : 'border-border-light text-text-secondary hover:bg-bg-subtle'"
                @click="form = mode as WritingJobMode"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <div class="flex justify-end">
            <NButton :loading="creating" @click="handleCreate">
              创建任务
            </NButton>
          </div>
        </div>

        <!-- Job exists: status & controls -->
        <div v-else class="space-y-4">
          <div class="border border-border-light rounded-lg bg-bg-surface p-6">
            <div class="mb-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Bot :size="20" class="text-primary" />
                <div>
                  <h3 class="text-sm text-text-primary font-bold">
                    写作任务
                  </h3>
                  <span class="text-xs text-text-muted">{{ modeLabel[job.mode] }}</span>
                </div>
              </div>
              <NTag :variant="statusVariant[job.status]">
                {{ statusLabel[job.status] }}
              </NTag>
            </div>

            <div v-if="job.lastError" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {{ job.lastError }}
            </div>

            <div class="flex gap-3">
              <NButton
                v-if="job.status === 'idle' || job.status === 'paused'"
                variant="primary"
                @click="handleStart"
              >
                <Play :size="14" class="mr-1" /> 启动
              </NButton>
              <NButton
                v-if="job.status === 'running'"
                @click="handlePause"
              >
                <Pause :size="14" class="mr-1" /> 暂停
              </NButton>
              <NButton
                v-if="job.status === 'waiting_review'"
                variant="primary"
                @click="handleContinue"
              >
                <CheckCircle2 :size="14" class="mr-1" /> 确认并继续
              </NButton>
              <NButton variant="ghost" class="text-text-muted hover:text-red-500" @click="handleDelete">
                <Trash2 :size="14" class="mr-1" /> 删除任务
              </NButton>
            </div>
          </div>

          <!-- Flow description -->
          <div class="border border-border-light rounded-lg bg-bg-surface p-4">
            <h4 class="mb-3 text-xs text-text-muted font-semibold">
              写作流程
            </h4>
            <div class="text-xs text-text-secondary space-y-2">
              <div class="flex items-center gap-2">
                <span class="h-5 w-5 flex items-center justify-center rounded-full bg-primary-soft text-[10px] text-primary font-bold">1</span>
                系统构建上下文，生成下一章建议
              </div>
              <div class="flex items-center gap-2">
                <span class="h-5 w-5 flex items-center justify-center rounded-full bg-primary-soft text-[10px] text-primary font-bold">2</span>
                作者审查 AI 生成内容
              </div>
              <div class="flex items-center gap-2">
                <span class="h-5 w-5 flex items-center justify-center rounded-full bg-primary-soft text-[10px] text-primary font-bold">3</span>
                作者确认写入，系统运行章后管线
              </div>
              <div class="flex items-center gap-2">
                <span class="h-5 w-5 flex items-center justify-center rounded-full bg-primary-soft text-[10px] text-primary font-bold">4</span>
                系统准备下一章上下文
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
