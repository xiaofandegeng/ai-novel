<script setup lang="ts">
import { NButton, NPanel } from '@ai-novel/ui'
import { AlertCircle, ChevronLeft, RefreshCw, Rocket } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AutonomousExceptionQueue from '@/features/autonomous-writing/components/AutonomousExceptionQueue.vue'
import AutonomousJobDetailModal from '@/features/autonomous-writing/components/AutonomousJobDetailModal.vue'
import AutonomousLiveInsight from '@/features/autonomous-writing/components/AutonomousLiveInsight.vue'
import AutonomousRunControlBar from '@/features/autonomous-writing/components/AutonomousRunControlBar.vue'
import AutonomousRunLauncher from '@/features/autonomous-writing/components/AutonomousRunLauncher.vue'
import AutonomousRunTimeline from '@/features/autonomous-writing/components/AutonomousRunTimeline.vue'
import { useAutonomousRun } from '@/features/autonomous-writing/composables/useAutonomousRun'

const route = useRoute()
const projectId = route.params.id as string

const {
  currentRun,
  error,
  exceptions,
  ignoreException,
  loadActiveRun,
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
  await loadActiveRun()
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
  const resolution = '作者已人工确认并批准继续运行。'
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
    loadActiveRun()
  }
}

function handleViewJob(jobId: string) {
  selectedJobId.value = jobId
}

function handleCloseModal() {
  selectedJobId.value = null
}
</script>

<template>
  <div class="autopilot-view mx-auto max-w-5xl p-6 space-y-6">
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

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Left Column: Controls and Timeline -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Control Bar: Show if active run exists -->
        <AutonomousRunControlBar
          v-if="currentRun"
          :current-run="currentRun"
          :loading="loading"
          @pause="handlePause"
          @resume="handleResume"
          @new-run="handleNewRun"
          @refresh="handleRefresh"
        />

        <!-- Launcher: Only show if no active run or if active run is finished -->
        <AutonomousRunLauncher
          v-if="!currentRun || ['completed', 'failed'].includes(currentRun.status)"
          :project-id="projectId"
          :loading="loading"
          :current-run="currentRun"
          @start="handleStart"
        />

        <!-- Active Run Progress -->
        <div v-if="currentRun" class="space-y-6">
          <AutonomousRunTimeline
            :jobs="currentRun.jobs"
            :current-job-id="currentRun.jobs.find(j => j.status === 'running')?.id"
            @view-job="handleViewJob"
          />
        </div>
      </div>

      <!-- Right Column: Exceptions and Settings -->
      <div class="space-y-6">
        <AutonomousLiveInsight :project-id="projectId" />

        <div v-if="currentRun" class="space-y-6">
          <NPanel title="待处理异常" :badge="exceptions.filter(e => e.status === 'open').length || undefined">
            <template v-if="exceptions.filter(e => e.status === 'open').length > 0">
              <AutonomousExceptionQueue
                :exceptions="exceptions.filter(e => e.status === 'open')"
                @resolve="handleResolve"
                @ignore="handleIgnore"
              />
            </template>
            <div v-else class="py-12 text-center text-text-muted">
              <div class="mb-2 flex justify-center opacity-20">
                <RefreshCw :size="48" />
              </div>
              <p>暂无待处理异常</p>
            </div>
          </NPanel>

          <NPanel title="自动驾驶说明">
            <ul class="list-disc pl-4 text-xs text-text-secondary space-y-2">
              <li><b>安全策略</b>：遇到任何不确定性都会暂停。</li>
              <li><b>平衡策略</b>：自动处理低风险变更，中高风险入队。</li>
              <li><b>快速策略</b>：跳过阻塞章节，尽可能完成剩余任务。</li>
              <li>异常入队时，任务会进入“需要关注”状态并停止。</li>
            </ul>
          </NPanel>
        </div>

        <div v-else class="border border-border-light rounded-xl bg-bg-subtle p-8 text-center text-text-muted">
          <p>请在左侧配置并启动自动驾驶</p>
        </div>
      </div>
    </div>

    <!-- Job Detail Modal -->
    <AutonomousJobDetailModal
      v-if="selectedJobId"
      :project-id="projectId"
      :job-id="selectedJobId"
      @close="handleCloseModal"
    />
  </div>
</template>

<style lang="scss" scoped>
.autopilot-view {
  min-height: 100vh;
}
</style>
