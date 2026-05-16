<script setup lang="ts">
import type { AutonomousScopeType, AutonomousStrategy, Chapter } from '@ai-novel/shared'
import {
  NButton,
  NInput,
  NPanel,
  NSelect,
} from '@ai-novel/ui'
import {
  AlertCircle,
  AlertTriangle,
  Rocket,
  Settings2,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { fetchChapters } from '@/api/chapters'

const props = defineProps<{
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
  startChapterId: undefined as string | undefined,
  endChapterId: undefined as string | undefined,
})

const chapters = ref<Chapter[]>([])
const loadingChapters = ref(false)

const strategyOptions = [
  { label: '安全 (仅自动低风险)', value: 'safe' },
  { label: '平衡 (自动低/中风险)', value: 'balanced' },
  { label: '快速 (尽可能自动推进)', value: 'fast' },
]

const scopeOptions = [
  { label: '后续 N 章', value: 'next_n_chapters' },
  { label: '从当前章向后续写', value: 'from_current_forward' },
  { label: '继续未完成章节', value: 'continue_incomplete' },
  { label: '重写指定章节', value: 'rewrite_selected' },
  { label: '全书范围', value: 'project' },
]

const chapterOptions = computed(() => {
  return chapters.value.map(c => ({
    label: `第 ${c.chapterNumber} 章: ${c.title}`,
    value: c.id,
  }))
})

onMounted(async () => {
  loadingChapters.value = true
  try {
    chapters.value = await fetchChapters(props.projectId)
  }
  catch (err) {
    console.error('Failed to fetch chapters', err)
  }
  finally {
    loadingChapters.value = false
  }
})

async function handleCreateAndStart() {
  emit('start', {
    ...form.value,
    targetChapterCount: form.value.scopeType === 'next_n_chapters' ? Number.parseInt(form.value.targetChapterCount) : undefined,
    targetWordsPerChapter: Number.parseInt(form.value.targetWordsPerChapter),
    startChapterId: form.value.startChapterId || undefined,
    endChapterId: form.value.endChapterId || undefined,
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
          </div>
        </div>

        <!-- Dynamic Inputs based on Scope -->
        <div class="grid grid-cols-2 gap-4">
          <template v-if="['chapter_range', 'rewrite_selected', 'from_current_forward'].includes(form.scopeType)">
            <div class="space-y-1">
              <NSelect
                v-model="form.startChapterId"
                label="开始章节"
                :options="chapterOptions"
                :loading="loadingChapters"
                placeholder="选择开始章节"
              />
            </div>
            <div v-if="form.scopeType !== 'from_current_forward'" class="space-y-1">
              <NSelect
                v-model="form.endChapterId"
                label="结束章节 (可选)"
                :options="chapterOptions"
                :loading="loadingChapters"
                placeholder="默认至最新章"
              />
            </div>
          </template>

          <div v-if="form.scopeType === 'next_n_chapters'" class="space-y-1">
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

        <!-- Strategy/Scope Description -->
        <div class="text-[10px] text-text-muted">
          <p v-if="form.scopeType === 'project'">
            全书范围将处理所有字数不足的章节（单次上限 20 章）。
          </p>
          <p v-if="form.scopeType === 'continue_incomplete'">
            自动扫描并补全草稿字数不足 500 字的章节。
          </p>
          <p v-if="form.scopeType === 'from_current_forward'">
            从指定章节开始向后续写，会自动跳过已完成且字数达标的章节。
          </p>
        </div>

        <!-- Warnings -->
        <div
          v-if="form.scopeType === 'rewrite_selected'"
          class="border-l-4 border-yellow-500 rounded bg-yellow-50 p-3 text-xs text-yellow-800"
        >
          <div class="mb-1 flex items-center gap-1 font-bold">
            <AlertTriangle :size="14" /> 风险提示
          </div>
          重写模式会<b>覆盖已有草稿</b>。系统会在写入前自动创建快照，但建议您在执行前确认已备份重要内容。
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
          :disabled="(['chapter_range', 'rewrite_selected', 'from_current_forward'].includes(form.scopeType) && !form.startChapterId)"
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
