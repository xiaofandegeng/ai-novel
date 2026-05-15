<script setup lang="ts">
import type { AutonomousScopeType, AutonomousStrategy } from '@ai-novel/shared'
import {
  NButton,
  NInput,
  NPanel,
  NSelect,
} from '@ai-novel/ui'
import {
  AlertCircle,
  Rocket,
  Settings2,
} from 'lucide-vue-next'
import { ref } from 'vue'

defineProps<{
  projectId: string
  loading?: boolean
  currentRun?: any
}>()

const emit = defineEmits<{
  (e: 'start', input: any): void
}>()

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
  emit('start', {
    ...form.value,
    targetChapterCount: Number.parseInt(form.value.targetChapterCount),
    targetWordsPerChapter: Number.parseInt(form.value.targetWordsPerChapter),
  })
}
</script>

<template>
  <div class="autonomous-run-launcher space-y-6">
    <!-- Configuration Form -->
    <NPanel class="config-panel">
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
            <p v-if="form.scopeType === 'project'" class="mt-1 text-[10px] text-text-muted">
              全书范围将处理所有字数不足的章节（单次上限 20 章）。
            </p>
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
  </div>
</template>

<style lang="scss" scoped>
.autonomous-run-launcher {
  max-width: 600px;
  margin: 0 auto;
}
</style>
