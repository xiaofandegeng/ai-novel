<script setup lang="ts">
import type { AutonomousScopeType, AutonomousStrategy, Chapter } from '@ai-novel/shared'
import { NDrawer, NInput, NSelect } from '@ai-novel/ui'
import { Rocket } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { fetchChapters } from '@/api/chapters'

const props = defineProps<{
  projectId: string
  open: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'start', input: any): void
  (e: 'close'): void
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

const chapterOptions = computed(() =>
  chapters.value.map(c => ({
    label: `第 ${c.chapterNumber} 章: ${c.title}`,
    value: c.id,
  })),
)

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    try {
      chapters.value = await fetchChapters(props.projectId)
    }
    catch (err) {
      console.error('Failed to fetch chapters', err)
    }
  }
})

function handleStart() {
  const chapterCount = Number.parseInt(form.value.targetChapterCount)
  const wordsPerChapter = Number.parseInt(form.value.targetWordsPerChapter)
  emit('start', {
    ...form.value,
    targetChapterCount: form.value.scopeType === 'next_n_chapters' && !Number.isNaN(chapterCount) ? chapterCount : undefined,
    targetWordsPerChapter: !Number.isNaN(wordsPerChapter) ? wordsPerChapter : 3000,
    startChapterId: form.value.startChapterId || undefined,
    endChapterId: form.value.endChapterId || undefined,
  })
}
</script>

<template>
  <NDrawer
    :model-value="open"
    title="启动自动驾驶"
    @update:model-value="$emit('close')"
  >
    <div class="p-2 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <NSelect
          v-model="form.strategy"
          label="写作策略"
          :options="strategyOptions"
          placeholder="选择自动化强度"
        />
        <NSelect
          v-model="form.scopeType"
          label="推进范围"
          :options="scopeOptions"
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <template v-if="['chapter_range', 'rewrite_selected', 'from_current_forward'].includes(form.scopeType)">
          <NSelect
            v-model="form.startChapterId"
            label="开始章节"
            :options="chapterOptions"
            placeholder="选择开始章节"
          />
          <NSelect
            v-if="form.scopeType !== 'from_current_forward'"
            v-model="form.endChapterId"
            label="结束章节 (可选)"
            :options="chapterOptions"
            placeholder="默认至最新章"
          />
        </template>

        <div v-if="form.scopeType === 'next_n_chapters'">
          <NInput
            v-model="form.targetChapterCount"
            label="目标章节数"
            type="number"
            placeholder="例如 3"
          />
        </div>

        <div>
          <NInput
            v-model="form.targetWordsPerChapter"
            label="每章目标字数"
            type="number"
          />
        </div>
      </div>

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

      <button
        class="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white font-medium transition-colors hover:bg-primary-hover disabled:opacity-50"
        :disabled="loading || (['chapter_range', 'rewrite_selected', 'from_current_forward'].includes(form.scopeType) && !form.startChapterId)"
        @click="handleStart"
      >
        <Rocket :size="16" />
        {{ loading ? '启动中...' : '开启自动驾驶' }}
      </button>
    </div>
  </NDrawer>
</template>
