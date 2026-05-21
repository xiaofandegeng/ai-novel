<script setup lang="ts">
import { NAppLayout, NButton, NPanel } from '@ai-novel/ui'
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  GitCompare,
  Lightbulb,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb.vue'
import AutonomousExceptionQueue from '@/features/autonomous-writing/components/autonomous-exception-queue.vue'
import AutonomousJobDetailModal from '@/features/autonomous-writing/components/autonomous-job-detail-modal.vue'
import AutonomousLiveInsight from '@/features/autonomous-writing/components/autonomous-live-insight.vue'
import AutonomousRunControlBar from '@/features/autonomous-writing/components/autonomous-run-control-bar.vue'
import AutonomousRunLauncher from '@/features/autonomous-writing/components/autonomous-run-launcher.vue'
import AutonomousRunTimeline from '@/features/autonomous-writing/components/autonomous-run-timeline.vue'
import { useAutonomousRun } from '@/features/autonomous-writing/composables/useAutonomousRun'
import { useProjectStore } from '@/stores/project.store'

const route = useRoute()
const projectId = route.params.id as string
const projectStore = useProjectStore()

const {
  currentRun,
  error,
  exceptions,
  ignoreException,
  loadLatestRun,
  loadRun,
  loading,
  resolveException,
  createRun,
  start,
  pause,
  resume,
} = useAutonomousRun(projectId)

const selectedJobId = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([
    projectStore.fetchProject(projectId),
    loadLatestRun(),
  ])
})

async function handleStart(input: any) {
  try {
    const run = await createRun(input)
    await start(run.id)
    await loadRun(run.id)
  }
  catch (err) {
    console.error('Failed to start run', err)
  }
}

async function handlePause(runId: string) {
  await pause(runId)
  await loadRun(runId)
}

async function handleResume(runId: string) {
  await resume(runId)
  await loadRun(runId)
}

function handleNewRun() {
  currentRun.value = null
}

async function handleResolve(ex: any) {
  if (!currentRun.value)
    return
  const resolution = '已恢复自动运行。'
  await resolveException(currentRun.value.id, ex.id, resolution)
  await loadRun(currentRun.value.id)
}

async function handleIgnore(ex: any) {
  if (!currentRun.value)
    return
  await ignoreException(currentRun.value.id, ex.id)
  await loadRun(currentRun.value.id)
}

function handleRefresh() {
  if (currentRun.value) {
    loadRun(currentRun.value.id)
  }
  else {
    loadLatestRun()
  }
}

function handleViewJob(jobId: string) {
  selectedJobId.value = jobId
}

function handleViewException(ex: any) {
  if (ex.writingJobId) {
    selectedJobId.value = ex.writingJobId
  }
}

function handleCloseModal() {
  selectedJobId.value = null
}

const syncItems = [
  {
    icon: Users,
    title: '角色与小角色',
    desc: '正文生成后自动抽取新增角色、登场状态、目标变化，并写入角色档案或待处理队列。',
  },
  {
    icon: GitCompare,
    title: '人物关系',
    desc: '根据互动、冲突和情绪变化更新关系强度、关系类型和历史演变。',
  },
  {
    icon: Zap,
    title: '矛盾矩阵',
    desc: '识别新矛盾、升级矛盾和已解决矛盾，避免剧情线各走各的。',
  },
  {
    icon: Lightbulb,
    title: '伏笔与事实',
    desc: '把新伏笔、回收点和事实三元组同步进台账，下一章自动进入上下文。',
  },
  {
    icon: ShieldCheck,
    title: '健康巡检',
    desc: '每章完成后检查偏题、人物跑偏、节奏异常和前后文断裂。',
  },
]
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
  >
    <template #topbar-left>
      <ProjectBreadcrumb
        :title="projectStore.currentProject?.title"
        title-fallback="加载中..."
        :title-to="`/project/${projectId}`"
      />
    </template>

    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="autopilot-view mx-auto max-w-7xl p-6 space-y-6">
      <!-- Header -->
      <header class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="rounded-lg bg-primary/10 p-2 text-primary">
            <Rocket :size="24" />
          </div>
          <div>
            <h1 class="text-2xl font-bold">
              自动写作驾驶舱
            </h1>
            <p class="text-sm text-text-muted">
              AI 驱动的连续章节创作与自动化流程管理
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <NButton variant="ghost" :loading="loading" @click="handleRefresh">
            <RefreshCw :size="16" class="mr-2" /> 刷新状态
          </NButton>
          <router-link :to="`/project/${projectId}/write`">
            <NButton variant="secondary">
              <ChevronLeft :size="16" class="mr-2" /> 返回编辑器
            </NButton>
          </router-link>
        </div>
      </header>

      <div v-if="error" class="flex items-start gap-3 border border-red-100 rounded-lg bg-red-50 p-4 text-red-600">
        <AlertCircle :size="18" class="mt-0.5" />
        <div>
          <p class="font-bold">
            发生错误
          </p>
          <p class="text-sm">
            {{ error }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
        <aside class="space-y-6">
          <AutonomousRunControlBar
            v-if="currentRun"
            :current-run="currentRun"
            :loading="loading"
            @pause="handlePause"
            @resume="handleResume"
            @new-run="handleNewRun"
            @refresh="handleRefresh"
          />

          <AutonomousRunLauncher
            v-if="!currentRun || ['completed', 'failed'].includes(currentRun.status)"
            :project-id="projectId"
            :loading="loading"
            :current-run="currentRun"
            @start="handleStart"
          />

          <NPanel v-if="currentRun" title="待处理异常">
            <template v-if="exceptions.filter(e => e.status === 'open').length > 0">
              <AutonomousExceptionQueue
                :exceptions="exceptions.filter(e => e.status === 'open')"
                @view="handleViewException"
                @resolve="handleResolve"
                @ignore="handleIgnore"
              />
            </template>
            <div v-else class="py-10 text-center text-sm text-text-muted">
              <div class="mb-2 flex justify-center opacity-20">
                <ShieldCheck :size="42" />
              </div>
              <p>暂无待处理异常</p>
            </div>
          </NPanel>
        </aside>

        <main class="space-y-6">
          <AutonomousLiveInsight :project-id="projectId" :run-id="currentRun?.id" />

          <NPanel
            title="章节推进与写回状态"
            description="每章会依次完成上下文构建、生成正文、一致性检查、自动修复、写回正文、章后分析和台账同步。"
          >
            <AutonomousRunTimeline
              v-if="currentRun"
              :jobs="currentRun.jobs"
              :current-job-id="currentRun.jobs.find(j => j.status === 'running')?.id"
              @view-job="handleViewJob"
            />
            <div v-else class="grid gap-4 py-2 md:grid-cols-2">
              <div class="border border-border-light rounded-lg border-dashed bg-bg-subtle p-4">
                <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <BookOpen :size="16" class="text-primary" />
                  未启动自动驾驶
                </div>
                <p class="text-sm text-text-muted leading-6">
                  启动后，这里会显示每章从大纲、场景、正文到章后分析的完整推进状态。
                </p>
              </div>
              <div class="border border-border-light rounded-lg border-dashed bg-bg-subtle p-4">
                <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck :size="16" class="text-primary" />
                  同步不会静默污染
                </div>
                <p class="text-sm text-text-muted leading-6">
                  高置信变更自动入库，低置信和冲突变更进入待处理队列，下一次写作会读取已确认结构。
                </p>
              </div>
            </div>
          </NPanel>

          <NPanel title="自动同步范围" description="自动驾驶不是单独写正文，而是持续维护小说工程里的结构化记忆。">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div
                v-for="item in syncItems"
                :key="item.title"
                class="border border-border-light rounded-lg bg-bg-surface p-3"
              >
                <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <component :is="item.icon" :size="16" class="text-primary" />
                  {{ item.title }}
                </div>
                <p class="text-xs text-text-muted leading-5">
                  {{ item.desc }}
                </p>
              </div>
            </div>
          </NPanel>
        </main>
      </div>

      <!-- Job Detail Modal -->
      <AutonomousJobDetailModal
        v-if="selectedJobId"
        :project-id="projectId"
        :job-id="selectedJobId"
        @close="handleCloseModal"
      />
    </div>
  </NAppLayout>
</template>

<style lang="scss" scoped>
.autopilot-view {
  min-height: 100vh;
}
</style>
