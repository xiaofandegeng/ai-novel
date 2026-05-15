<script setup lang="ts">
import type { AutonomousScopeType, AutonomousStrategy } from '@ai-novel/shared'
import type { TagVariant } from '@ai-novel/ui'
import {
  NButton,
  NInput,
  NLoadingState,
  NPanel,
  NSelect,
  NTag,
} from '@ai-novel/ui'
import {
  AlertCircle,
  CheckCircle2,
  ListFilter,
  Pause,
  Play,
  Rocket,
  Settings2,
} from 'lucide-vue-next'
import { ref } from 'vue'
import { useAutonomousRun } from '../composables/useAutonomousRun'

const props = defineProps<{
  projectId: string
}>()

const { currentRun, loading, createRun, start, pause, resume } = useAutonomousRun(props.projectId)

const form = ref({
  strategy: 'balanced' as AutonomousStrategy,
  scopeType: 'next_n_chapters' as AutonomousScopeType,
  targetChapterCount: '3',
  targetWordsPerChapter: '3000',
})

const strategyOptions = [
  { label: '安全 (仅自动低风险)', value: 'safe' },
  { label: '平衡 (自动低/中风险)', value: 'balanced' },
  { label: '快速 (尽可能自动推进)', value: 'fast' },
]

const scopeOptions = [
  { label: '后续 N 章', value: 'next_n_chapters' },
  { label: '全书范围', value: 'project' },
]

async function handleCreateAndStart() {
  try {
    const run = await createRun({
      ...form.value,
      targetChapterCount: Number.parseInt(form.value.targetChapterCount),
      targetWordsPerChapter: Number.parseInt(form.value.targetWordsPerChapter),
    })
    await start(run.id)
  }
  catch {
    // Error handled in composable
  }
}

function getStatusColor(status: string): TagVariant {
  switch (status) {
    case 'running': return 'primary'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'paused':
    case 'needs_attention': return 'warning'
    default: return 'default'
  }
}
</script>

<template>
  <div class="autonomous-run-launcher space-y-6">
    <!-- Active Run Status -->
    <NPanel v-if="currentRun" class="active-run-card" border-primary>
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="bg-primary-subtle rounded-full p-2 text-primary">
            <Rocket :size="20" />
          </div>
          <div>
            <h3 class="text-lg font-bold">
              正在自动驾驶
            </h3>
            <p class="text-xs text-text-muted">
              策略: {{ currentRun.strategy }} | 进度: {{ currentRun.completedChapterCount }} / {{ currentRun.targetChapterCount || '?' }}
            </p>
          </div>
        </div>
        <NTag :variant="getStatusColor(currentRun.status) as any">
          {{ currentRun.status.toUpperCase() }}
        </NTag>
      </div>

      <div class="space-y-3">
        <div class="h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
          <div
            class="h-full bg-primary transition-all duration-500"
            :style="{ width: `${(currentRun.completedChapterCount / (currentRun.targetChapterCount || 1)) * 100}%` }"
          />
        </div>

        <div class="flex gap-2">
          <NButton
            v-if="currentRun.status === 'running'"
            @click="pause(currentRun.id)"
          >
            <Pause :size="16" class="mr-2" /> 暂停
          </NButton>
          <NButton
            v-else-if="['paused', 'needs_attention'].includes(currentRun.status)"
            variant="primary"
            @click="resume(currentRun.id)"
          >
            <Play :size="16" class="mr-2" /> 继续推进
          </NButton>
          <NButton variant="secondary" outline @click="currentRun = null">
            新任务
          </NButton>
        </div>
      </div>
    </NPanel>

    <!-- Configuration Form -->
    <NPanel v-else class="config-panel">
      <template #header>
        <div class="flex items-center gap-2">
          <Settings2 :size="18" />
          <span>配置自动驾驶任务</span>
        </div>
      </template>

      <div class="py-2 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1">
            <NSelect
              v-model="form.strategy"
              label="写作策略"
              :options="strategyOptions"
              placeholder="选择自动化强度"
            />
          </div>
          <div class="space-y-1">
            <NSelect
              v-model="form.scopeType"
              label="推进范围"
              :options="scopeOptions"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1">
            <NInput
              v-model="form.targetChapterCount"
              label="目标章节数"
              type="number"
              placeholder="例如 3"
            />
          </div>
          <div class="space-y-1">
            <NInput
              v-model="form.targetWordsPerChapter"
              label="每章目标字数"
              type="number"
            />
          </div>
        </div>

        <div class="border-l-4 border-primary rounded bg-bg-subtle p-3 text-xs text-text-secondary">
          <div class="mb-1 flex items-center gap-1 font-bold">
            <AlertCircle :size="12" /> 注意
          </div>
          自动驾驶模式将自动执行上下文构建、生成、审查（基于策略）和应用。高风险变更或严重一致性冲突将产生异常并可能暂停任务。
        </div>

        <NButton
          variant="primary"
          block
          size="lg"
          :loading="loading"
          @click="handleCreateAndStart"
        >
          <Rocket :size="18" class="mr-2" /> 开启自动驾驶
        </NButton>
      </div>
    </NPanel>

    <!-- Run Summary (Jobs List) -->
    <div v-if="currentRun?.jobs?.length" class="space-y-2">
      <div class="flex items-center gap-1 px-1 text-xs text-text-muted font-bold">
        <ListFilter :size="12" /> 任务队列 ({{ currentRun.jobs.length }})
      </div>
      <div class="space-y-1">
        <div
          v-for="job in currentRun.jobs"
          :key="job.id"
          class="flex items-center justify-between border border-border-light rounded bg-bg-surface p-2 text-sm"
        >
          <div class="flex items-center gap-2">
            <CheckCircle2 v-if="job.status === 'completed'" :size="14" class="text-green-500" />
            <NLoadingState v-else-if="job.status === 'running'" size="sm" />
            <div v-else class="h-3.5 w-3.5 border border-text-muted rounded-full border-dashed" />
            <span>章节 ID: {{ job.chapterId?.slice(0, 8) }}...</span>
          </div>
          <NTag size="sm" :variant="getStatusColor(job.status) as any">
            {{ job.status }}
          </NTag>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.autonomous-run-launcher {
  max-width: 600px;
  margin: 0 auto;
}
</style>
